import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chooseTestSubtree,
  claudeAdapter,
  copilotAdapter,
  enumerateTestSubtrees,
  hasDedicatedTestRepo,
  resolveEmbeddedWorkspace,
  runDoctor,
  runUpdate,
  scaffold,
} from "../src/index.js";
import type { DetectedStack, ScaffoldManifest, WizardAnswers, WorkspaceInfo } from "../src/index.js";
import { tempProject } from "./helpers.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint"],
  observability: [],
  performance: [],
  manifests: ["package.json"],
};

const answers: WizardAnswers = {
  automationFramework: "playwright-ts",
  reportLanguage: "en",
  autonomyLevel: "medium",
  qaConventions: "Independent, deterministic tests.",
  atlassianMcp: false,
  playwrightMcp: false,
};

// --- R-096: detection + flag resolution -------------------------------------

describe("enumerateTestSubtrees / chooseTestSubtree (R-096)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  it("detects a subtree by its test-framework config (e2e/playwright.config.ts)", () => {
    mkdirSync(join(project.dir, "e2e"));
    writeFileSync(join(project.dir, "e2e", "playwright.config.ts"), "export default {};\n");
    writeFileSync(join(project.dir, "package.json"), '{"name":"app"}\n'); // host app manifest at root
    expect(enumerateTestSubtrees(project.dir)).toContain("e2e");
  });

  it("detects a build-module subtree with a test-hint name (integration-tests/pom.xml)", () => {
    mkdirSync(join(project.dir, "integration-tests"));
    writeFileSync(join(project.dir, "integration-tests", "pom.xml"), "<project/>\n");
    expect(enumerateTestSubtrees(project.dir)).toContain("integration-tests");
  });

  it("detects a top-level conventional test folder (qa-tests/ with spec files)", () => {
    mkdirSync(join(project.dir, "qa-tests"));
    writeFileSync(join(project.dir, "qa-tests", "login.spec.ts"), "test('x', () => {});\n");
    expect(enumerateTestSubtrees(project.dir)).toContain("qa-tests");
  });

  it("does NOT treat a root-level config or nested src/test as a subtree", () => {
    writeFileSync(join(project.dir, "playwright.config.ts"), "export default {};\n"); // root config
    mkdirSync(join(project.dir, "src", "test", "java"), { recursive: true });
    writeFileSync(join(project.dir, "src", "test", "java", "FooTest.java"), "class FooTest {}\n");
    const subs = enumerateTestSubtrees(project.dir);
    expect(subs).not.toContain(""); // never the root
    expect(subs).not.toContain("src/test/java"); // nested app test dir, not a subtree
    expect(subs).not.toContain("src/test");
  });

  it("chooseTestSubtree prefers the shallowest, strongest-hint candidate; null when empty", () => {
    expect(chooseTestSubtree([])).toBeNull();
    expect(chooseTestSubtree(["packages/e2e", "e2e"])).toBe("e2e"); // shallower wins
    expect(chooseTestSubtree(["tests", "e2e"])).toBe("e2e"); // earlier hint wins
  });
});

describe("hasDedicatedTestRepo — precedence gate (R-096)", () => {
  it("true when a repo name signals a dedicated test repo, false otherwise", () => {
    expect(hasDedicatedTestRepo(["test-repo", "app-a"])).toBe(true);
    expect(hasDedicatedTestRepo(["qa-suite", "web"])).toBe(true);
    // All app repos, none test-named → embedded is the fallback.
    expect(hasDedicatedTestRepo(["payments", "web", "gateway"])).toBe(false);
  });
});

describe("resolveEmbeddedWorkspace — flag path (R-096)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  it("single-host: builds {testRepo:'.', devRepos:[], testSubpath} and validates existence", () => {
    mkdirSync(join(project.dir, "e2e"));
    const res = resolveEmbeddedWorkspace({ root: project.dir, testSubpath: "e2e", candidates: [] });
    expect("workspace" in res && res.workspace).toEqual({ testRepo: ".", devRepos: [], testSubpath: "e2e" });
  });

  it("multi-host: names the host, derives sorted dev repos from the rest", () => {
    mkdirSync(join(project.dir, "app-a", "e2e"), { recursive: true });
    const res = resolveEmbeddedWorkspace({
      root: project.dir,
      testSubpath: "e2e",
      testHost: "app-a",
      candidates: ["app-a", "app-b", "app-c"],
    });
    expect("workspace" in res && res.workspace).toEqual({
      testRepo: "app-a",
      devRepos: ["app-b", "app-c"],
      testSubpath: "e2e",
    });
  });

  it("errors on a missing subtree, an absolute path, '.', and an unknown host", () => {
    // Missing dir.
    expect("error" in resolveEmbeddedWorkspace({ root: project.dir, testSubpath: "nope", candidates: [] })).toBe(true);
    // Absolute.
    expect(
      "error" in resolveEmbeddedWorkspace({ root: project.dir, testSubpath: "/abs/e2e", candidates: [] }),
    ).toBe(true);
    // Root.
    expect("error" in resolveEmbeddedWorkspace({ root: project.dir, testSubpath: ".", candidates: [] })).toBe(true);
    // Unknown host.
    mkdirSync(join(project.dir, "app-a", "e2e"), { recursive: true });
    expect(
      "error" in
        resolveEmbeddedWorkspace({
          root: project.dir,
          testSubpath: "e2e",
          testHost: "ghost",
          candidates: ["app-a"],
        }),
    ).toBe(true);
  });
});

// --- R-095: data model + write-boundary render ------------------------------

describe("embedded topology — render (R-095)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  /** Single-host: one app repo (scan root = write root) with an `e2e/` subtree. */
  function scaffoldSingleHost(adapter = claudeAdapter): WorkspaceInfo {
    mkdirSync(join(project.dir, "e2e"));
    const workspace: WorkspaceInfo = { testRepo: ".", devRepos: [], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: project.dir, workspace, adapter, stack, answers });
    return workspace;
  }

  it("records testSubpath in the manifest (single-host: testRepo '.', no devRepos)", () => {
    scaffoldSingleHost();
    const manifest = JSON.parse(
      readFileSync(join(project.dir, "context/.scaffold/manifest.json"), "utf8"),
    ) as ScaffoldManifest;
    expect(manifest.workspace?.testRepo).toBe(".");
    expect(manifest.workspace?.devRepos).toEqual([]);
    expect(manifest.workspace?.testSubpath).toBe("e2e");
    // No .code-workspace and no workspaceFile for single-host.
    expect(manifest.workspace?.workspaceFile).toBeUndefined();
    expect(existsSync(join(project.dir, `${basename(project.dir)}.code-workspace`))).toBe(false);
  });

  it("renders the embedded write-boundary rule (names the subtree) into root config + write skills", () => {
    scaffoldSingleHost();
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).toMatch(/Workspace boundary/);
    expect(root).toContain("`e2e/`");
    expect(root).toContain("application source");
    // Read-only skills carry no write tools → no boundary rule.
    const writeSkill = readFileSync(join(project.dir, ".claude/skills/qa-test-automate/SKILL.md"), "utf8");
    expect(writeSkill).toMatch(/Workspace boundary/);
    expect(writeSkill).toContain("`e2e/`");
    const readSkill = readFileSync(join(project.dir, ".claude/skills/qa-coverage-gap/SKILL.md"), "utf8");
    expect(readSkill).not.toMatch(/Workspace boundary/);
    // No leftover placeholder.
    expect(root).not.toContain("{{MULTI_REPO_RULE}}");
  });

  it("deploys the multi-repo-boundaries guideline with the embedded section (single-host)", () => {
    scaffoldSingleHost();
    const guideline = readFileSync(join(project.dir, ".ai/guidelines/multi-repo-boundaries.md"), "utf8");
    expect(guideline).toContain("Embedded test topology");
    expect(guideline).toContain("testSubpath");
    expect(guideline).toContain("read-only application source");
  });

  it("multi-host: names the subtree AND the sibling dev repos, emits the .code-workspace", () => {
    // parent/app-a (host, has e2e/) + app-b (read-only source)
    mkdirSync(join(project.dir, "app-a", "e2e"), { recursive: true });
    writeFileSync(join(project.dir, "app-a", "package.json"), '{"name":"app-a"}\n');
    mkdirSync(join(project.dir, "app-b"));
    writeFileSync(join(project.dir, "app-b", "pom.xml"), "<project/>\n");
    const writeRoot = join(project.dir, "app-a");
    const workspace: WorkspaceInfo = { testRepo: "app-a", devRepos: ["app-b"], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot, workspace, adapter: claudeAdapter, stack, answers });

    const root = readFileSync(join(writeRoot, "CLAUDE.md"), "utf8");
    expect(root).toContain("`e2e/`");
    expect(root).toContain("`../app-b/`");
    // Multi-host still emits the parent .code-workspace (R-097 adds the carve-out).
    expect(existsSync(join(project.dir, `${basename(project.dir)}.code-workspace`))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(writeRoot, "context/.scaffold/manifest.json"), "utf8"),
    ) as ScaffoldManifest;
    expect(manifest.workspace?.testSubpath).toBe("e2e");
    expect(manifest.workspace?.workspaceFile).toBe(`../${basename(project.dir)}.code-workspace`);
  });

  it("ships the embedded rule on Copilot too (parity)", () => {
    mkdirSync(join(project.dir, "e2e"));
    const workspace: WorkspaceInfo = { testRepo: ".", devRepos: [], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: project.dir, workspace, adapter: copilotAdapter, stack, answers });
    const root = readFileSync(join(project.dir, ".github/copilot-instructions.md"), "utf8");
    expect(root).toMatch(/Workspace boundary/);
    expect(root).toContain("`e2e/`");
  });
});

// --- R-097: editor guardrail ------------------------------------------------

describe("embedded editor guardrail (R-097)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  function readJson(rel: string): Record<string, Record<string, boolean>> {
    return JSON.parse(readFileSync(join(project.dir, rel), "utf8"));
  }

  it("single-host: writes .vscode/settings.json pinning source read-only, carving out subtree + config", () => {
    mkdirSync(join(project.dir, "e2e"));
    const workspace: WorkspaceInfo = { testRepo: ".", devRepos: [], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: project.dir, workspace, adapter: claudeAdapter, stack, answers });
    const s = readJson(".vscode/settings.json");
    expect(s["files.readonlyInclude"]).toEqual({ "**": true });
    expect(s["files.readonlyExclude"]!["e2e/**"]).toBe(true);
    expect(s["files.readonlyExclude"]!["context/**"]).toBe(true);
    expect(s["files.readonlyExclude"]!["CLAUDE.md"]).toBe(true);
    // No .code-workspace for single-host.
    expect(existsSync(join(project.dir, `${basename(project.dir)}.code-workspace`))).toBe(false);
  });

  it("single-host: shallow-merges into an existing settings.json, never overwriting the user's keys", () => {
    mkdirSync(join(project.dir, "e2e"));
    mkdirSync(join(project.dir, ".vscode"));
    // Pre-existing settings the user cares about, including a conflicting readonly key.
    writeFileSync(
      join(project.dir, ".vscode", "settings.json"),
      JSON.stringify({ "editor.tabSize": 2, "files.readonlyInclude": { "custom/**": true } }, null, 2),
    );
    const workspace: WorkspaceInfo = { testRepo: ".", devRepos: [], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: project.dir, workspace, adapter: claudeAdapter, stack, answers });
    const s = readJson(".vscode/settings.json") as unknown as Record<string, unknown>;
    // User keys preserved.
    expect(s["editor.tabSize"]).toBe(2);
    // Existing readonlyInclude left untouched (we do NOT overwrite the user's value).
    expect(s["files.readonlyInclude"]).toEqual({ "custom/**": true });
    // The missing key we own IS added.
    expect((s["files.readonlyExclude"] as Record<string, boolean>)["e2e/**"]).toBe(true);
  });

  it("single-host: leaves a non-JSON (JSONC/commented) settings.json untouched", () => {
    mkdirSync(join(project.dir, "e2e"));
    mkdirSync(join(project.dir, ".vscode"));
    const original = '{\n  // a comment — this is JSONC\n  "editor.tabSize": 4\n}\n';
    writeFileSync(join(project.dir, ".vscode", "settings.json"), original);
    const workspace: WorkspaceInfo = { testRepo: ".", devRepos: [], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: project.dir, workspace, adapter: claudeAdapter, stack, answers });
    expect(readFileSync(join(project.dir, ".vscode", "settings.json"), "utf8")).toBe(original);
  });

  it("multi-host: .code-workspace carves the host subtree+config writable, host source read-only", () => {
    mkdirSync(join(project.dir, "app-a", "e2e"), { recursive: true });
    writeFileSync(join(project.dir, "app-a", "package.json"), '{"name":"app-a"}\n');
    mkdirSync(join(project.dir, "app-b"));
    writeFileSync(join(project.dir, "app-b", "pom.xml"), "<project/>\n");
    const workspace: WorkspaceInfo = { testRepo: "app-a", devRepos: ["app-b"], testSubpath: "e2e" };
    scaffold({ root: project.dir, writeRoot: join(project.dir, "app-a"), workspace, adapter: claudeAdapter, stack, answers });
    const ws = readJson(`${basename(project.dir)}.code-workspace`).settings as unknown as Record<string, Record<string, boolean>>;
    // Host source + sibling dev repo pinned read-only.
    expect(ws["files.readonlyInclude"]!["app-a/**"]).toBe(true);
    expect(ws["files.readonlyInclude"]!["app-b/**"]).toBe(true);
    // Host's test subtree + config carved back writable.
    expect(ws["files.readonlyExclude"]!["app-a/e2e/**"]).toBe(true);
    expect(ws["files.readonlyExclude"]!["app-a/context/**"]).toBe(true);
  });

  it("dedicated multi-repo (no testSubpath) still has no readonlyExclude carve-out (unchanged)", () => {
    mkdirSync(join(project.dir, "test-repo"));
    writeFileSync(join(project.dir, "test-repo", "package.json"), '{"name":"t"}\n');
    mkdirSync(join(project.dir, "app-a"));
    writeFileSync(join(project.dir, "app-a", "pom.xml"), "<project/>\n");
    const workspace: WorkspaceInfo = { testRepo: "test-repo", devRepos: ["app-a"] };
    scaffold({ root: project.dir, writeRoot: join(project.dir, "test-repo"), workspace, adapter: claudeAdapter, stack, answers });
    const ws = readJson(`${basename(project.dir)}.code-workspace`).settings as unknown as Record<string, Record<string, boolean>>;
    expect(ws["files.readonlyInclude"]).toEqual({ "app-a/**": true });
    expect(ws["files.readonlyExclude"]).toBeUndefined();
  });
});

// --- R-098: doctor + update topology awareness ------------------------------

describe("embedded doctor (R-098)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  /** Fresh single-host embedded scaffold in a temp dir. */
  function scaffoldSingleHost(): void {
    mkdirSync(join(project.dir, "e2e"));
    scaffold({
      root: project.dir,
      writeRoot: project.dir,
      workspace: { testRepo: ".", devRepos: [], testSubpath: "e2e" },
      adapter: claudeAdapter,
      stack,
      answers,
      toolVersion: "1.0.0",
    });
  }

  it("a fresh single-host embedded scaffold is doctor-clean", () => {
    scaffoldSingleHost();
    const report = runDoctor(project.dir, claudeAdapter);
    expect(
      report.errorCount,
      JSON.stringify(report.findings.filter((f) => f.severity === "error")),
    ).toBe(0);
  });

  it("errors when testSubpath no longer exists (EMBEDDED:subpath)", () => {
    scaffoldSingleHost();
    // Remove the subtree the manifest points at.
    rmSync(join(project.dir, "e2e"), { recursive: true, force: true });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "EMBEDDED:subpath" && f.severity === "error")).toBe(true);
  });

  it("errors on a nested orchestration install inside the subtree (EMBEDDED:leak:subtree)", () => {
    scaffoldSingleHost();
    mkdirSync(join(project.dir, "e2e", "context", ".scaffold"), { recursive: true });
    writeFileSync(join(project.dir, "e2e", "context", ".scaffold", "manifest.json"), "{}\n");
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "EMBEDDED:leak:subtree" && f.severity === "error")).toBe(true);
  });

  it("errors when the root config drops the boundary rule (EMBEDDED:rule)", () => {
    scaffoldSingleHost();
    writeFileSync(join(project.dir, "CLAUDE.md"), "# QA orchestration — root map\n\nno rule here\n");
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "EMBEDDED:rule" && f.severity === "error")).toBe(true);
  });

  it("warns when the editor guardrail is missing (EMBEDDED:guardrail)", () => {
    scaffoldSingleHost();
    rmSync(join(project.dir, ".vscode", "settings.json"), { force: true });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "EMBEDDED:guardrail" && f.severity === "warn")).toBe(true);
    // Missing guardrail is a warn, not an error — the scaffold is still valid.
    expect(report.findings.some((f) => f.id === "EMBEDDED:guardrail" && f.severity === "error")).toBe(false);
  });

  it("does not run embedded checks on a single-repo scaffold (no testSubpath)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id.startsWith("EMBEDDED:"))).toBe(false);
  });
});

describe("embedded update re-render (R-098)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  it("re-renders the embedded rule from the manifest (no drift, no strip) and never rewrites settings.json", () => {
    mkdirSync(join(project.dir, "e2e"));
    scaffold({
      root: project.dir,
      writeRoot: project.dir,
      workspace: { testRepo: ".", devRepos: [], testSubpath: "e2e" },
      adapter: claudeAdapter,
      stack,
      answers,
      toolVersion: "1.0.0",
    });
    const settingsBefore = readFileSync(join(project.dir, ".vscode/settings.json"), "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true, toolVersion: "1.0.0" });
    const find = (rel: string) => report.items.find((i) => i.rel === rel);
    // The embedded rule survives re-render (would strip to "" without the workspace
    // vars threaded through buildVars).
    expect(find("CLAUDE.md")?.action).toBe("unchanged");
    expect(find(".claude/skills/qa-test-automate/SKILL.md")?.action).toBe("unchanged");
    expect(readFileSync(join(project.dir, "CLAUDE.md"), "utf8")).toContain("`e2e/`");
    // settings.json is untracked → update never touches it (never clobber).
    expect(report.items.some((i) => i.rel === ".vscode/settings.json")).toBe(false);
    expect(readFileSync(join(project.dir, ".vscode/settings.json"), "utf8")).toBe(settingsBefore);
  });
});
