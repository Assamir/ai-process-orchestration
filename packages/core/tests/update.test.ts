import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, compareToolVersions, copilotAdapter, runUpdate, scaffold } from "../src/index.js";
import type { DetectedStack, ScaffoldManifest, WizardAnswers } from "../src/index.js";
import { tempProject } from "./helpers.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint"],
  observability: [],
  manifests: ["package.json"],
};

const answers: WizardAnswers = {
  atlassianMcp: false,
  playwrightMcp: false,
  automationFramework: "playwright-ts",
  reportLanguage: "en",
  autonomyLevel: "medium",
  qaConventions: "Independent, deterministic tests.",
};

const MANIFEST = "context/.scaffold/manifest.json";
const GUIDELINE = claudeAdapter.guidelineRel("qa-conventions");

function readManifest(dir: string): ScaffoldManifest {
  return JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")) as ScaffoldManifest;
}

describe("runUpdate (update command, R-034)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
  });
  afterEach(() => project.cleanup());

  it("reports up-to-date on a freshly scaffolded repo (no actionable items)", () => {
    const report = runUpdate(project.dir, claudeAdapter, { write: false });
    expect(report.fatal).toBeUndefined();
    expect(report.counts.create).toBe(0);
    expect(report.counts.update).toBe(0);
    expect(report.counts.drift).toBe(0);
    expect(report.counts.orphan).toBe(0);
    expect(report.items.every((i) => i.action === "unchanged")).toBe(true);
  });

  it("fatals when no manifest exists", () => {
    const bare = tempProject();
    try {
      const report = runUpdate(bare.dir, claudeAdapter, { write: false });
      expect(report.fatal).toMatch(/No scaffold found/);
      expect(report.items).toHaveLength(0);
    } finally {
      bare.cleanup();
    }
  });

  it("fatals when the manifest platform does not match the adapter", () => {
    const report = runUpdate(project.dir, copilotAdapter, { write: false });
    expect(report.fatal).toMatch(/generated for "claude"/);
  });

  it("creates a missing (additive) file — e.g. a deleted guideline returns", () => {
    const abs = join(project.dir, GUIDELINE);
    writeFileSync(abs, "", "utf8");
    rmSync(abs);
    expect(existsSync(abs)).toBe(false);

    const dry = runUpdate(project.dir, claudeAdapter, { write: false });
    const item = dry.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("create");
    expect(existsSync(abs)).toBe(false); // dry-run wrote nothing

    const wrote = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(wrote.counts.create).toBe(1);
    expect(existsSync(abs)).toBe(true);
  });

  it("refreshes a pristine file when its template changed (simulated by an older baseline)", () => {
    // Simulate "core changed the template since this repo was scaffolded" by
    // rewriting both the on-disk file AND its manifest baseline to an older
    // value. The on-disk content still matches the (older) baseline → pristine.
    const abs = join(project.dir, GUIDELINE);
    const older = "# OLD pristine content\n";
    writeFileSync(abs, older, "utf8");
    const m = readManifest(project.dir);
    m.files![GUIDELINE] = createHash("sha256").update(older, "utf8").digest("hex");
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("update");
    // The file was refreshed to the current template (no longer the OLD content).
    expect(readFileSync(abs, "utf8")).not.toContain("OLD pristine content");
    // Manifest baseline was refreshed to the new content's hash.
    const after = readManifest(project.dir);
    expect(after.files![GUIDELINE]).not.toBe(m.files![GUIDELINE]);
    expect(after.updatedAt).toBeTruthy();
  });

  it("never clobbers a user-edited (drifted) file", () => {
    const abs = join(project.dir, GUIDELINE);
    const edited = `${readFileSync(abs, "utf8")}\n\n## My project notes\nHand-written.\n`;
    writeFileSync(abs, edited, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("drift");
    expect(item?.detail).toMatch(/user-modified/);
    // Untouched on disk.
    expect(readFileSync(abs, "utf8")).toBe(edited);
  });

  it("treats every differing file as drift when the manifest has no baseline (pre-R-034)", () => {
    const abs = join(project.dir, GUIDELINE);
    writeFileSync(abs, "# changed, no baseline\n", "utf8");
    const m = readManifest(project.dir);
    delete m.files; // simulate a manifest written before R-034
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("drift");
    expect(item?.detail).toMatch(/pre-R-034/);
    expect(readFileSync(abs, "utf8")).toBe("# changed, no baseline\n");
  });

  it("reports an orphaned file recorded in the baseline but no longer scaffolded", () => {
    const orphanRel = "context/.scaffold/legacy-skill.md";
    writeFileSync(join(project.dir, orphanRel), "old\n", "utf8");
    const m = readManifest(project.dir);
    m.files![orphanRel] = "deadbeef";
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === orphanRel);
    expect(item?.action).toBe("orphan");
    // Never deleted.
    expect(existsSync(join(project.dir, orphanRel))).toBe(true);
    // Dropped from the refreshed baseline (we no longer manage it).
    expect(readManifest(project.dir).files![orphanRel]).toBeUndefined();
  });

  it("dry-run writes nothing", () => {
    const abs = join(project.dir, GUIDELINE);
    rmSync(abs);
    const before = readManifest(project.dir);

    const report = runUpdate(project.dir, claudeAdapter, { write: false });
    expect(report.mode).toBe("dry-run");
    expect(existsSync(abs)).toBe(false);
    // Manifest untouched (no updatedAt added).
    expect(readManifest(project.dir)).toEqual(before);
  });

  it("is idempotent: a second write run finds nothing actionable", () => {
    const abs = join(project.dir, GUIDELINE);
    rmSync(abs);
    runUpdate(project.dir, claudeAdapter, { write: true });

    const second = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(second.items.every((i) => i.action === "unchanged")).toBe(true);
  });
});

describe("compareToolVersions (R-038)", () => {
  it("orders dotted-integer versions numerically", () => {
    expect(compareToolVersions("0.27.0", "0.28.0")).toBe(-1);
    expect(compareToolVersions("0.28.0", "0.27.0")).toBe(1);
    expect(compareToolVersions("0.28.0", "0.28.0")).toBe(0);
    // numeric, not lexicographic (so 0.9 < 0.10)
    expect(compareToolVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareToolVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("ignores pre-release/build suffixes and missing components", () => {
    expect(compareToolVersions("0.28.0-rc.1", "0.28.0")).toBe(0);
    expect(compareToolVersions("0.28", "0.28.0")).toBe(0);
  });

  it("returns null for unparseable versions", () => {
    expect(compareToolVersions("latest", "0.28.0")).toBeNull();
    expect(compareToolVersions("0.28.0", "")).toBeNull();
  });
});

describe("runUpdate version awareness (R-038)", () => {
  let project: ReturnType<typeof tempProject>;
  afterEach(() => project.cleanup());

  it("records toolVersion in the manifest at scaffold time", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers, toolVersion: "0.28.0" });
    expect(readManifest(project.dir).toolVersion).toBe("0.28.0");
  });

  it("reports scaffolded -> running and an upgrade direction", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers, toolVersion: "0.28.0" });
    const report = runUpdate(project.dir, claudeAdapter, { write: false, toolVersion: "0.30.0" });
    expect(report.version).toEqual({ scaffolded: "0.28.0", running: "0.30.0", direction: "upgrade" });
  });

  it("flags a downgrade when the running tool is older than the scaffolding one", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers, toolVersion: "0.30.0" });
    const report = runUpdate(project.dir, claudeAdapter, { write: false, toolVersion: "0.28.0" });
    expect(report.version?.direction).toBe("downgrade");
  });

  it("reports 'unknown' when the manifest predates R-038 (no toolVersion)", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers }); // no toolVersion
    expect(readManifest(project.dir).toolVersion).toBeUndefined();
    const report = runUpdate(project.dir, claudeAdapter, { write: false, toolVersion: "0.28.0" });
    expect(report.version).toEqual({ scaffolded: undefined, running: "0.28.0", direction: "unknown" });
  });

  it("refreshes manifest.toolVersion to the running version on --write", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers, toolVersion: "0.28.0" });
    runUpdate(project.dir, claudeAdapter, { write: true, toolVersion: "0.30.0" });
    expect(readManifest(project.dir).toolVersion).toBe("0.30.0");
  });

  it("preserves the recorded toolVersion when --write supplies none", () => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers, toolVersion: "0.28.0" });
    // Force a write by deleting a file so there is an actionable change.
    rmSync(join(project.dir, GUIDELINE));
    runUpdate(project.dir, claudeAdapter, { write: true }); // no toolVersion
    expect(readManifest(project.dir).toolVersion).toBe("0.28.0");
  });
});
