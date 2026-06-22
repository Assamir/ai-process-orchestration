import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, compareToolVersions, copilotAdapter, runUpdate, scaffold } from "../src/index.js";
import type { DetectedStack, FileBaseline, ScaffoldManifest, WizardAnswers } from "../src/index.js";
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

describe("baseline stored as content (R-039)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
  });
  afterEach(() => project.cleanup());

  it("records the full rendered base content (not just a hash) for every file", () => {
    const m = readManifest(project.dir);
    const entry = m.files![GUIDELINE] as FileBaseline;
    expect(typeof entry).toBe("object");
    expect(typeof entry.hash).toBe("string");
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    // The recorded base is byte-identical to what was written to disk.
    expect(entry.content).toBe(readFileSync(join(project.dir, GUIDELINE), "utf8"));
    // Every scaffolded file carries a content baseline, not a bare hash.
    expect(Object.values(m.files!).every((e) => typeof e === "object" && "content" in e)).toBe(true);
  });

  it("detects pristineness by content even when the recorded hash is stale", () => {
    // A content baseline whose hash is deliberately wrong: the direct content
    // comparison must win, so a pristine file is still refreshed (not drift).
    const abs = join(project.dir, GUIDELINE);
    const older = "# OLD pristine content\n";
    writeFileSync(abs, older, "utf8");
    const m = readManifest(project.dir);
    m.files![GUIDELINE] = { hash: "deadbeef", content: older };
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("update");
    expect(readFileSync(abs, "utf8")).not.toContain("OLD pristine content");
    // Baseline refreshed to the new content (object shape, correct hash).
    const after = readManifest(project.dir).files![GUIDELINE] as FileBaseline;
    expect(after.content).toBe(readFileSync(abs, "utf8"));
    expect(after.hash).not.toBe("deadbeef");
  });

  it("treats a file edited away from its content baseline as drift, preserving the base verbatim", () => {
    const abs = join(project.dir, GUIDELINE);
    const before = readManifest(project.dir).files![GUIDELINE] as FileBaseline;
    writeFileSync(abs, `${before.content}\n\n## Local notes\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(report.items.find((i) => i.rel === GUIDELINE)?.action).toBe("drift");
    // The recorded base content is preserved unchanged so it keeps reporting drift.
    const after = readManifest(project.dir).files![GUIDELINE] as FileBaseline;
    expect(after.content).toBe(before.content);
  });
});

describe("runUpdate 3-way merge (R-040)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
  });
  afterEach(() => project.cleanup());

  /**
   * Simulate "the template changed upstream since this repo was scaffolded" by
   * recording an *older* base in the manifest (differing from the current
   * template at line 0), while the user keeps a separate local edit on disk.
   */
  function setupOlderBase(localEdit: (base: string) => string) {
    const abs = join(project.dir, GUIDELINE);
    const current = readFileSync(abs, "utf8"); // == the current template (theirs)
    const lines = current.split("\n");
    const base = ["# OLD HEADING", ...lines.slice(1)].join("\n"); // upstream changed line 0
    const onDisk = localEdit(base);
    writeFileSync(abs, onDisk, "utf8");
    const m = readManifest(project.dir);
    m.files![GUIDELINE] = { hash: createHash("sha256").update(base, "utf8").digest("hex"), content: base };
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");
    return { abs, current };
  }

  it("merges a clean upstream delta onto a disjoint local edit", () => {
    // Local edit (a trailing note) is disjoint from the upstream line-0 change.
    const { abs, current } = setupOlderBase((base) => `${base}Local note from the user.\n`);

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("merge");

    const after = readFileSync(abs, "utf8");
    // Both sides survive: the upstream heading replaces "# OLD HEADING"…
    expect(after).not.toContain("# OLD HEADING");
    expect(after.split("\n")[0]).toBe(current.split("\n")[0]);
    // …and the user's local note is preserved.
    expect(after).toContain("Local note from the user.");
    // Baseline advanced to the current template so the next run is reconciled.
    expect((readManifest(project.dir).files![GUIDELINE] as FileBaseline).content).toBe(current);
  });

  it("reports a conflict (and never writes) when local and upstream edits clash", () => {
    // Local edits the very line (0) that upstream also changed → genuine conflict.
    const { abs } = setupOlderBase((base) => ["# MY HEADING", ...base.split("\n").slice(1)].join("\n"));
    const onDisk = readFileSync(abs, "utf8");
    const baselineBefore = readManifest(project.dir).files![GUIDELINE] as FileBaseline;

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("conflict");
    expect(item?.detail).toMatch(/conflict/);
    // File left exactly as the user had it — never clobbered.
    expect(readFileSync(abs, "utf8")).toBe(onDisk);
    // Baseline preserved verbatim so it keeps reporting until resolved.
    expect(readManifest(project.dir).files![GUIDELINE]).toEqual(baselineBefore);
  });

  it("dry-run reports a merge plan without writing", () => {
    const { abs } = setupOlderBase((base) => `${base}Local note from the user.\n`);
    const onDisk = readFileSync(abs, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: false });
    expect(report.counts.merge).toBe(1);
    expect(readFileSync(abs, "utf8")).toBe(onDisk); // dry-run wrote nothing
  });

  it("a merged file is stable: once reconciled it's plain drift, never re-written", () => {
    const { abs } = setupOlderBase((base) => `${base}Local note from the user.\n`);
    runUpdate(project.dir, claudeAdapter, { write: true });
    const merged = readFileSync(abs, "utf8");

    // Second run: the baseline now equals the current template (no upstream
    // delta left), so the file is just local drift — reported, not touched.
    const second = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(second.items.find((i) => i.rel === GUIDELINE)?.action).toBe("drift");
    expect(readFileSync(abs, "utf8")).toBe(merged);
  });

  it("exposes structured conflict regions on a conflict item (R-041)", () => {
    setupOlderBase((base) => ["# MY HEADING", ...base.split("\n").slice(1)].join("\n"));
    const report = runUpdate(project.dir, claudeAdapter, { write: false });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("conflict");
    expect(item?.conflict?.count).toBeGreaterThan(0);
    // The regions reconstruct the file and carry at least one conflict region.
    expect(item?.conflict?.regions.some((r) => r.kind === "conflict")).toBe(true);
  });

  it("writes an interactively-resolved conflict and advances the baseline (R-041)", () => {
    const { abs, current } = setupOlderBase((base) =>
      ["# MY HEADING", ...base.split("\n").slice(1)].join("\n"),
    );

    // Resolve the conflict by taking the upstream template wholesale (what the
    // CLI's form would produce if the user picked "take theirs" for every region).
    const report = runUpdate(project.dir, claudeAdapter, {
      write: true,
      resolutions: { [GUIDELINE]: current },
    });
    const item = report.items.find((i) => i.rel === GUIDELINE);
    expect(item?.action).toBe("merge");
    expect(item?.detail).toMatch(/resolved interactively/);
    // The resolved content is on disk…
    expect(readFileSync(abs, "utf8")).toBe(current);
    // …and the baseline advanced to the template, so the next run is reconciled.
    expect((readManifest(project.dir).files![GUIDELINE] as FileBaseline).content).toBe(current);
    const second = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(second.items.find((i) => i.rel === GUIDELINE)?.action).toBe("unchanged");
  });

  it("leaves a conflict untouched when no resolution is supplied (R-041 skip path)", () => {
    const { abs } = setupOlderBase((base) => ["# MY HEADING", ...base.split("\n").slice(1)].join("\n"));
    const onDisk = readFileSync(abs, "utf8");
    const baselineBefore = readManifest(project.dir).files![GUIDELINE] as FileBaseline;

    // --write with resolutions for *other* files only — this conflict was skipped.
    const report = runUpdate(project.dir, claudeAdapter, { write: true, resolutions: {} });
    expect(report.items.find((i) => i.rel === GUIDELINE)?.action).toBe("conflict");
    expect(readFileSync(abs, "utf8")).toBe(onDisk);
    expect(readManifest(project.dir).files![GUIDELINE]).toEqual(baselineBefore);
  });

  it("ignores resolutions in dry-run (nothing written) (R-041)", () => {
    const { abs, current } = setupOlderBase((base) =>
      ["# MY HEADING", ...base.split("\n").slice(1)].join("\n"),
    );
    const onDisk = readFileSync(abs, "utf8");
    const report = runUpdate(project.dir, claudeAdapter, {
      write: false,
      resolutions: { [GUIDELINE]: current },
    });
    // Still reported as a conflict, and the file is untouched.
    expect(report.items.find((i) => i.rel === GUIDELINE)?.action).toBe("conflict");
    expect(readFileSync(abs, "utf8")).toBe(onDisk);
  });

  it("falls back to drift (no merge) for a pre-R-039 hash-only baseline", () => {
    const abs = join(project.dir, GUIDELINE);
    const current = readFileSync(abs, "utf8");
    const base = ["# OLD HEADING", ...current.split("\n").slice(1)].join("\n");
    writeFileSync(abs, `${base}Local note.\n`, "utf8");
    const m = readManifest(project.dir);
    // Hash-only entry (no content) → no base to merge from → classic drift.
    m.files![GUIDELINE] = createHash("sha256").update(base, "utf8").digest("hex");
    writeFileSync(join(project.dir, MANIFEST), `${JSON.stringify(m, null, 2)}\n`, "utf8");

    const report = runUpdate(project.dir, claudeAdapter, { write: true });
    expect(report.items.find((i) => i.rel === GUIDELINE)?.action).toBe("drift");
    expect(readFileSync(abs, "utf8")).toBe(`${base}Local note.\n`); // untouched
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
