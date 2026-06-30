import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chooseTestRepo,
  claudeAdapter,
  copilotAdapter,
  defaultWorkspace,
  enumerateRepos,
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

const workspace: WorkspaceInfo = { testRepo: "test-repo", devRepos: ["app-a", "app-b"] };

/** A parent folder holding a git/manifest test repo + two developer repos + noise. */
function setupParent(dir: string): void {
  mkdirSync(join(dir, "test-repo"));
  writeFileSync(join(dir, "test-repo", "package.json"), '{"name":"test-repo"}\n');
  mkdirSync(join(dir, "app-a", ".git"), { recursive: true }); // a git repo
  mkdirSync(join(dir, "app-b"));
  writeFileSync(join(dir, "app-b", "pom.xml"), "<project/>\n"); // a manifest repo
  mkdirSync(join(dir, "node_modules", "left-pad"), { recursive: true }); // noise
  mkdirSync(join(dir, "docs")); // a plain dir, not a repo
  mkdirSync(join(dir, ".hidden")); // dotdir, skipped
}

describe("enumerateRepos / chooseTestRepo (R-083)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  it("lists only immediate git/manifest repos, sorted, skipping noise + dotdirs", () => {
    setupParent(project.dir);
    expect(enumerateRepos(project.dir)).toEqual(["app-a", "app-b", "test-repo"]);
  });

  it("returns [] for a directory with no qualifying sub-repos (single-repo case)", () => {
    mkdirSync(join(project.dir, "src"));
    mkdirSync(join(project.dir, "tests"));
    expect(enumerateRepos(project.dir)).toEqual([]);
  });

  it("picks the most test-like candidate deterministically", () => {
    expect(chooseTestRepo(["app-a", "app-b", "test-repo"])).toBe("test-repo");
    expect(chooseTestRepo(["payments", "qa-suite", "web"])).toBe("qa-suite");
    expect(chooseTestRepo(["e2e", "tests"])).toBe("e2e"); // earlier hint wins
    // No hint anywhere → stable alphabetical fallback.
    expect(chooseTestRepo(["beta", "alpha"])).toBe("alpha");
  });

  it("defaultWorkspace splits test repo from sorted dev repos", () => {
    expect(defaultWorkspace(["app-b", "app-a", "test-repo"])).toEqual({
      testRepo: "test-repo",
      devRepos: ["app-a", "app-b"],
    });
  });
});

describe("scaffold scan/write-root split (R-083, R-084, R-085, R-086)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
    setupParent(project.dir);
  });
  afterEach(() => project.cleanup());

  function scaffoldMulti(adapter = claudeAdapter) {
    const writeRoot = join(project.dir, "test-repo");
    const results = scaffold({ root: project.dir, writeRoot, workspace, adapter, stack, answers });
    return { writeRoot, results };
  }

  it("writes every artifact under the test repo, nothing into the parent or dev repos", () => {
    const { writeRoot } = scaffoldMulti();
    expect(existsSync(join(writeRoot, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(writeRoot, "context/.scaffold/manifest.json"))).toBe(true);
    // Parent has no orchestration files (only the .code-workspace, below).
    expect(existsSync(join(project.dir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(project.dir, "context"))).toBe(false);
    // Developer repos are untouched.
    for (const dev of workspace.devRepos) {
      expect(existsSync(join(project.dir, dev, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(project.dir, dev, ".claude"))).toBe(false);
      expect(existsSync(join(project.dir, dev, "context"))).toBe(false);
    }
  });

  it("records the workspace block in the manifest (paths relative to the parent)", () => {
    const { writeRoot } = scaffoldMulti();
    const manifest = JSON.parse(
      readFileSync(join(writeRoot, "context/.scaffold/manifest.json"), "utf8"),
    ) as ScaffoldManifest;
    expect(manifest.workspace?.testRepo).toBe("test-repo");
    expect(manifest.workspace?.devRepos).toEqual(["app-a", "app-b"]);
    expect(manifest.workspace?.workspaceFile).toBe(`../${basename(project.dir)}.code-workspace`);
  });

  it("emits the .code-workspace into the parent, test repo first, dev repos pinned read-only (R-086)", () => {
    scaffoldMulti();
    const wsPath = join(project.dir, `${basename(project.dir)}.code-workspace`);
    expect(existsSync(wsPath)).toBe(true);
    const ws = JSON.parse(readFileSync(wsPath, "utf8")) as {
      folders: Array<{ path: string }>;
      settings: Record<string, Record<string, boolean>>;
    };
    expect(ws.folders[0]!.path).toBe("test-repo");
    expect(ws.folders.map((f) => f.path)).toEqual(["test-repo", "app-a", "app-b"]);
    expect(ws.settings["files.readonlyInclude"]).toEqual({ "app-a/**": true, "app-b/**": true });
    // Claude contributes no chat-discovery settings (it ignores .code-workspace).
    expect(ws.settings["chat.promptFilesLocations"]).toBeUndefined();
  });

  it("pins Copilot chat-discovery locations at the test repo's .github (R-094, vscode#296972)", () => {
    scaffoldMulti(copilotAdapter);
    const wsPath = join(project.dir, `${basename(project.dir)}.code-workspace`);
    const ws = JSON.parse(readFileSync(wsPath, "utf8")) as {
      settings: Record<string, Record<string, boolean>>;
    };
    expect(ws.settings["chat.promptFilesLocations"]).toEqual({ "test-repo/.github/prompts": true });
    expect(ws.settings["chat.instructionsFilesLocations"]).toEqual({
      "test-repo/.github/instructions": true,
    });
    expect(ws.settings["chat.modeFilesLocations"]).toEqual({ "test-repo/.github/agents": true });
    // The dev-repo read-only pinning is platform-agnostic and stays.
    expect(ws.settings["files.readonlyInclude"]).toEqual({ "app-a/**": true, "app-b/**": true });
  });

  it("renders the DEVELOPER_REPOS source-reference section into repo-map.md + system-overview.md (R-084)", () => {
    const { writeRoot } = scaffoldMulti();
    const repoMap = readFileSync(join(writeRoot, "context/foundation/repo-map.md"), "utf8");
    expect(repoMap).toContain("## External source repositories");
    expect(repoMap).toContain("`../app-a/`");
    expect(repoMap).toContain("`../app-b/`");
    const overview = readFileSync(join(writeRoot, "context/reference/system-overview.md"), "utf8");
    expect(overview).toContain("## External source repositories");
    expect(overview).toContain("`../app-a/`");
  });

  it("injects the multi-repo write-boundary rule into the root config + write skills (R-085)", () => {
    const { writeRoot } = scaffoldMulti();
    const root = readFileSync(join(writeRoot, "CLAUDE.md"), "utf8");
    expect(root).toMatch(/Workspace boundary/);
    expect(root).toContain("`test-repo`");
    const writeSkill = readFileSync(join(writeRoot, ".claude/skills/qa-test-automate/SKILL.md"), "utf8");
    expect(writeSkill).toMatch(/Workspace boundary/);
    // Read-only skills never get write tools, so they keep no boundary rule either.
    const readSkill = readFileSync(join(writeRoot, ".claude/skills/qa-coverage-gap/SKILL.md"), "utf8");
    expect(readSkill).not.toMatch(/Workspace boundary/);
  });

  it("a fresh multi-repo scaffold is doctor-clean", () => {
    const { writeRoot } = scaffoldMulti();
    const report = runDoctor(writeRoot, claudeAdapter);
    expect(report.errorCount, JSON.stringify(report.findings.filter((f) => f.severity === "error"))).toBe(0);
  });

  it("ships the same multi-repo wiring on Copilot (parity)", () => {
    const { writeRoot } = scaffoldMulti(copilotAdapter);
    expect(existsSync(join(writeRoot, ".github/copilot-instructions.md"))).toBe(true);
    const root = readFileSync(join(writeRoot, ".github/copilot-instructions.md"), "utf8");
    expect(root).toMatch(/Workspace boundary/);
    // The .code-workspace is emitted by scaffold (folders + read-only pinning shared);
    // only the chat-discovery settings differ per platform (R-094, asserted above).
    expect(existsSync(join(project.dir, `${basename(project.dir)}.code-workspace`))).toBe(true);
  });
});

describe("single-repo backward compatibility (R-083)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => { project = tempProject(); });
  afterEach(() => project.cleanup());

  it("omits the workspace block, .code-workspace, and dev-repo sections entirely", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const manifest = JSON.parse(
      readFileSync(join(project.dir, "context/.scaffold/manifest.json"), "utf8"),
    ) as ScaffoldManifest;
    expect(manifest.workspace).toBeUndefined();
    expect(existsSync(join(project.dir, `${basename(project.dir)}.code-workspace`))).toBe(false);

    const repoMap = readFileSync(join(project.dir, "context/foundation/repo-map.md"), "utf8");
    expect(repoMap).not.toContain("External source repositories");
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).not.toMatch(/Workspace boundary/);
    const writeSkill = readFileSync(join(project.dir, ".claude/skills/qa-test-automate/SKILL.md"), "utf8");
    expect(writeSkill).not.toMatch(/Workspace boundary/);
    // The MULTI_REPO_RULE / DEVELOPER_REPOS placeholders are fully resolved (not leftover).
    expect(repoMap).not.toContain("{{DEVELOPER_REPOS}}");
    expect(writeSkill).not.toContain("{{MULTI_REPO_RULE}}");
  });
});

describe("doctor multi-repo checks (R-085)", () => {
  let project: ReturnType<typeof tempProject>;
  let writeRoot: string;
  beforeEach(() => {
    project = tempProject();
    setupParent(project.dir);
    writeRoot = join(project.dir, "test-repo");
    scaffold({ root: project.dir, writeRoot, workspace, adapter: claudeAdapter, stack, answers });
  });
  afterEach(() => project.cleanup());

  it("flags scaffold output leaked into a developer repo (MULTIREPO:leak)", () => {
    // A stray root config in a dev repo is a leak.
    writeFileSync(join(project.dir, "app-a", "CLAUDE.md"), "stray\n");
    const report = runDoctor(writeRoot, claudeAdapter);
    expect(report.findings.some((f) => f.id === "MULTIREPO:leak:app-a" && f.severity === "error")).toBe(true);
    // app-b is clean → no leak finding for it.
    expect(report.findings.some((f) => f.id === "MULTIREPO:leak:app-b")).toBe(false);
  });

  it("flags a gutted multi-repo-boundaries guideline (MULTIREPO:contract)", () => {
    writeFileSync(
      join(writeRoot, ".ai/guidelines/multi-repo-boundaries.md"),
      "# Multi-repo\n\nNothing of substance.\n\n✅ good\n❌ bad\n",
    );
    const report = runDoctor(writeRoot, claudeAdapter);
    expect(report.findings.some((f) => f.id === "MULTIREPO:contract" && f.severity === "error")).toBe(true);
  });

  it("does not run the leak check on a single-repo scaffold (no workspace block)", () => {
    const single = tempProject();
    try {
      scaffold({ root: single.dir, adapter: claudeAdapter, stack, answers });
      const report = runDoctor(single.dir, claudeAdapter);
      expect(report.findings.some((f) => f.id.startsWith("MULTIREPO:leak"))).toBe(false);
      expect(report.findings.some((f) => f.id === "MULTIREPO:contract")).toBe(false);
    } finally {
      single.cleanup();
    }
  });
});

describe("update preserves multi-repo content (R-088)", () => {
  let project: ReturnType<typeof tempProject>;
  let writeRoot: string;
  beforeEach(() => {
    project = tempProject();
    setupParent(project.dir);
    writeRoot = join(project.dir, "test-repo");
    scaffold({
      root: project.dir,
      writeRoot,
      workspace,
      adapter: claudeAdapter,
      stack,
      answers,
      toolVersion: "1.0.0",
    });
  });
  afterEach(() => project.cleanup());

  it("re-renders the dev-repo sections from the manifest workspace block (no drift, no strip)", () => {
    const report = runUpdate(writeRoot, claudeAdapter, { write: false, toolVersion: "1.0.0" });
    const find = (rel: string) => report.items.find((i) => i.rel === rel);
    // Without re-deriving DEVELOPER_REPOS / MULTI_REPO_RULE from the workspace block,
    // these would re-render empty and show as a pristine `update` that strips them.
    expect(find("context/foundation/repo-map.md")?.action).toBe("unchanged");
    expect(find("context/reference/system-overview.md")?.action).toBe("unchanged");
    expect(find("CLAUDE.md")?.action).toBe("unchanged");
    expect(find(".claude/skills/qa-test-automate/SKILL.md")?.action).toBe("unchanged");
    // The dev-repo section survives untouched on disk.
    expect(readFileSync(join(writeRoot, "context/foundation/repo-map.md"), "utf8")).toContain(
      "## External source repositories",
    );
  });
});
