import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, fixLinks, runDoctor, scaffold } from "../src/index.js";
import type { DetectedStack, WizardAnswers } from "../src/index.js";
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
  atlassianMcp: false,
  playwrightMcp: false,
  automationFramework: "playwright-ts",
  reportLanguage: "en",
  autonomyLevel: "medium",
  qaConventions: "Independent, deterministic tests.",
};

const GUIDELINE = ".ai/guidelines/qa-conventions.md";

function mkfile(dir: string, rel: string, content = "x"): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

describe("fixLinks (doctor --fix, R-031)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
  });
  afterEach(() => project.cleanup());

  it("dry-run proposes a relocated-file repair without writing", () => {
    mkfile(project.dir, "context/active/my-relocated-doc.md");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [doc](./my-relocated-doc.md).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: false });
    expect(report.mode).toBe("dry-run");
    expect(report.fixes).toHaveLength(1);
    expect(report.fixes[0]).toMatchObject({
      file: GUIDELINE,
      oldTarget: "./my-relocated-doc.md",
      newTarget: "../../context/active/my-relocated-doc.md",
      class: "relocated",
    });

    // Nothing written: the link is still broken on disk.
    expect(readFileSync(join(project.dir, GUIDELINE), "utf8")).toContain("(./my-relocated-doc.md)");
    expect(runDoctor(project.dir, claudeAdapter).findings.some((f) => f.id.startsWith("LINK:"))).toBe(true);
  });

  it("--write repairs the link so doctor stops flagging it", () => {
    mkfile(project.dir, "context/active/my-relocated-doc.md");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [doc](./my-relocated-doc.md).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.mode).toBe("write");
    expect(report.fixes).toHaveLength(1);

    const text = readFileSync(join(project.dir, GUIDELINE), "utf8");
    expect(text).toContain("(../../context/active/my-relocated-doc.md)");
    expect(text).not.toContain("(./my-relocated-doc.md)");
    expect(runDoctor(project.dir, claudeAdapter).findings.some((f) => f.id.startsWith("LINK:"))).toBe(false);
  });

  it("preserves a #anchor when rewriting", () => {
    mkfile(project.dir, "context/active/my-relocated-doc.md", "# Title\n\n## Section\n");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [doc](./my-relocated-doc.md#section).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.fixes[0]!.newTarget).toBe("../../context/active/my-relocated-doc.md#section");
    expect(readFileSync(join(project.dir, GUIDELINE), "utf8")).toContain(
      "(../../context/active/my-relocated-doc.md#section)",
    );
  });

  it("disambiguates a Playwright HTML report among several index.html candidates", () => {
    mkfile(project.dir, "docs/index.html");
    mkfile(project.dir, "playwright-report/index.html");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [report](./playwright-report/index.html).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.fixes).toHaveLength(1);
    expect(report.fixes[0]).toMatchObject({
      class: "playwright-report",
      resolved: "playwright-report/index.html",
      newTarget: "../../playwright-report/index.html",
    });
  });

  it("disambiguates a Playwright trace among several trace.zip candidates", () => {
    mkfile(project.dir, "archive/trace.zip");
    mkfile(project.dir, "test-results/run1/trace.zip");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [trace](./trace.zip).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.fixes).toHaveLength(1);
    expect(report.fixes[0]).toMatchObject({
      class: "playwright-trace",
      resolved: "test-results/run1/trace.zip",
    });
  });

  it("leaves a link unfixable when no file with that basename exists", () => {
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [gone](./totally-missing-xyz.md).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.fixes).toHaveLength(0);
    expect(report.unfixable).toEqual([{ file: GUIDELINE, target: "./totally-missing-xyz.md" }]);
    // Still a doctor error after the fix attempt.
    expect(runDoctor(project.dir, claudeAdapter).findings.some((f) => f.id.startsWith("LINK:"))).toBe(true);
  });

  it("leaves a link unfixable when the basename is ambiguous (non-Playwright)", () => {
    mkfile(project.dir, "context/a/dup.md");
    mkfile(project.dir, "context/b/dup.md");
    appendFileSync(join(project.dir, GUIDELINE), "\nSee [dup](./dup.md).\n");

    const report = fixLinks(project.dir, claudeAdapter, { write: true });
    expect(report.fixes).toHaveLength(0);
    expect(report.unfixable.some((u) => u.target === "./dup.md")).toBe(true);
  });

  it("reports clean when there are no broken links", () => {
    const report = fixLinks(project.dir, claudeAdapter, { write: false });
    expect(report.fixes).toHaveLength(0);
    expect(report.unfixable).toHaveLength(0);
  });
});
