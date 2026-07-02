import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeAdapter,
  copilotAdapter,
  GUIDELINES,
  guidelineApplies,
  resolveGuidelineNames,
  runDoctor,
  runUpdate,
  scaffold,
} from "../src/index.js";
import type { DetectedStack, WizardAnswers, WorkspaceInfo } from "../src/index.js";
import { tempProject } from "./helpers.js";

const baseStack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint", "prettier"],
  observability: [],
  performance: [],
  manifests: ["package.json"],
};

const baseAnswers: WizardAnswers = {
  automationFramework: "playwright-ts",
  reportLanguage: "en",
  autonomyLevel: "medium",
  qaConventions: "Independent, deterministic tests.",
  atlassianMcp: false,
  playwrightMcp: false,
};

const CONDITIONAL = ["performance-testing", "mcp-content-fetch", "multi-repo-boundaries"];
const guidelineRel = (name: string) => `.ai/guidelines/${name}.md`;

describe("stack-aware guideline deploy (R-091)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("guidelineApplies: absent `when` is universal; a `when` gates on the install context", () => {
    const conventions = GUIDELINES.find((g) => g.name === "qa-conventions")!;
    expect(conventions.when, "universal guideline has no `when`").toBeUndefined();
    expect(guidelineApplies(conventions, baseStack, baseAnswers)).toBe(true);

    const perf = GUIDELINES.find((g) => g.name === "performance-testing")!;
    expect(guidelineApplies(perf, baseStack, baseAnswers)).toBe(false);
    expect(guidelineApplies(perf, { ...baseStack, performance: ["jmeter"] }, baseAnswers)).toBe(true);

    const fetch = GUIDELINES.find((g) => g.name === "mcp-content-fetch")!;
    expect(guidelineApplies(fetch, baseStack, baseAnswers)).toBe(false);
    expect(guidelineApplies(fetch, baseStack, { ...baseAnswers, xrayMcp: true })).toBe(true);

    const multi = GUIDELINES.find((g) => g.name === "multi-repo-boundaries")!;
    expect(guidelineApplies(multi, baseStack, baseAnswers)).toBe(false);
    expect(guidelineApplies(multi, baseStack, baseAnswers, { testRepo: "qa", devRepos: ["app"] })).toBe(true);
  });

  it("the 3 conditional guidelines are NOT deployed on a default single-repo scaffold", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    for (const name of CONDITIONAL) {
      expect(existsSync(join(project.dir, guidelineRel(name))), `${name} absent`).toBe(false);
    }
    // Every universal guideline (no `when`) still deploys; no conditional one does
    // on this default context.
    const universal = GUIDELINES.filter((g) => !g.when);
    for (const g of universal) {
      expect(existsSync(join(project.dir, guidelineRel(g.name))), `${g.name} present`).toBe(true);
    }
    // A conditional guideline deploys iff its `when` matches this context. On the
    // default playwright-ts single-repo scaffold that means page-object-conventions
    // (frameworks: playwright-ts) deploys and every other conditional stays absent.
    for (const g of GUIDELINES.filter((g) => g.when)) {
      const shouldDeploy = guidelineApplies(g, baseStack, baseAnswers);
      expect(existsSync(join(project.dir, guidelineRel(g.name))), `conditional ${g.name} deploy=${shouldDeploy}`).toBe(shouldDeploy);
    }
  });

  it("records the deployed guideline set in manifest.choices.guidelines", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    const manifest = JSON.parse(readFileSync(join(project.dir, "context/.scaffold/manifest.json"), "utf8"));
    const recorded: string[] = manifest.choices.guidelines;
    expect(recorded).toEqual(resolveGuidelineNames(baseStack, baseAnswers));
    for (const name of CONDITIONAL) expect(recorded).not.toContain(name);
    expect(recorded).toContain("grounding");
  });

  it("deploys a conditional guideline when its context matches (perf stack, multi-repo)", () => {
    const workspace: WorkspaceInfo = { testRepo: "qa", devRepos: ["app"] };
    scaffold({
      root: project.dir,
      writeRoot: project.dir,
      workspace,
      adapter: claudeAdapter,
      stack: { ...baseStack, performance: ["jmeter"] },
      answers: { ...baseAnswers, atlassianMcp: true },
    });
    for (const name of CONDITIONAL) {
      expect(existsSync(join(project.dir, guidelineRel(name))), `${name} present`).toBe(true);
    }
  });

  it("doctor is clean on a stack-aware scaffold (no spurious missing-guideline errors)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.filter((f) => f.severity === "error"), JSON.stringify(report.findings)).toEqual([]);
  });

  it("doctor warns (not errors) on a guideline on disk but absent from the manifest set", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    // Simulate a stale orphan: a *valid* guideline file (so it passes the examples
    // check) that the recorded set simply doesn't list — exactly what `update`
    // leaves behind when a stack-aware `when` stops selecting a guideline.
    const perfBody = GUIDELINES.find((g) => g.name === "performance-testing")!.body;
    writeFileSync(join(project.dir, guidelineRel("performance-testing")), perfBody, "utf8");
    const report = runDoctor(project.dir, claudeAdapter);
    const unexpected = report.findings.find((f) => f.id === "GUIDELINE:unexpected:performance-testing");
    expect(unexpected, "set-consistency warn raised").toBeDefined();
    expect(unexpected!.severity).toBe("warn");
    expect(report.errorCount, "an orphan guideline is not an error").toBe(0);
  });

  it("update re-renders from the recorded set and never deletes a no-longer-matching guideline", () => {
    // Scaffold WITH a perf stack so performance-testing is deployed + recorded.
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: { ...baseStack, performance: ["jmeter"] }, answers: baseAnswers });
    expect(existsSync(join(project.dir, guidelineRel("performance-testing")))).toBe(true);

    // A dry-run update re-renders from the recorded set: performance-testing stays
    // expected (recorded), so it is unchanged — not reported as an orphan/removal.
    const report = runUpdate(project.dir, claudeAdapter, { write: false });
    expect(report.fatal).toBeUndefined();
    const perfItem = report.items.find((i) => i.rel === guidelineRel("performance-testing"));
    expect(perfItem?.action).toBe("unchanged");
    // The file is never deleted by update.
    expect(existsSync(join(project.dir, guidelineRel("performance-testing")))).toBe(true);
  });

  it("an extended-tier guideline's deployed lean carries the inline-code full-guide pointer (R-090/093)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    // grounding has an `extended` tier → its deployed lean points at the full guide,
    // as inline code (not a Markdown link, so it can't trip the broken-link check).
    const grounding = readFileSync(join(project.dir, guidelineRel("grounding")), "utf8");
    expect(grounding).toContain("`docs/guidelines/grounding.md`");
    expect(grounding).not.toContain("](docs/guidelines/grounding.md)");
    // A lean-only guideline carries no pointer.
    const docAsCode = readFileSync(join(project.dir, guidelineRel("documentation-as-code")), "utf8");
    expect(docAsCode).not.toContain("docs/guidelines/documentation-as-code.md");
  });

  it("security-testing (R-093) ships with examples + doctor-clean only when security is in scope", () => {
    // Not deployed by default (no security tooling, no override).
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    expect(existsSync(join(project.dir, guidelineRel("security-testing")))).toBe(false);

    // Deployed when a security tool is detected (forward-looking R-055 dimension).
    const secProject = tempProject();
    try {
      scaffold({
        root: secProject.dir,
        adapter: claudeAdapter,
        stack: { ...baseStack, security: ["zap"] },
        answers: baseAnswers,
      });
      const guide = readFileSync(join(secProject.dir, guidelineRel("security-testing")), "utf8");
      expect(guide).toContain("✅");
      expect(guide).toContain("❌");
      expect(guide.toLowerCase()).toContain("threat model");
      expect(guide).toContain("{{SECURITY_PATTERNS}}");
      const report = runDoctor(secProject.dir, claudeAdapter);
      expect(report.errorCount, JSON.stringify(report.findings)).toBe(0);
    } finally {
      secProject.cleanup();
    }
  });

  it("page-object-conventions (R-106) deploys for Playwright stacks only, with examples", () => {
    // Deployed on the default playwright-ts stack, with the mandatory examples + placeholder.
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
    const guide = readFileSync(join(project.dir, guidelineRel("page-object-conventions")), "utf8");
    expect(guide).toContain("✅");
    expect(guide).toContain("❌");
    expect(guide).toContain("{{PAGE_OBJECT_PATTERNS}}");

    // Deployed for playwright-java too.
    const javaProject = tempProject();
    try {
      scaffold({
        root: javaProject.dir,
        adapter: claudeAdapter,
        stack: { ...baseStack, language: "java", buildTool: "maven", frameworks: ["playwright-java"], primaryFramework: "playwright-java", manifests: ["pom.xml"] },
        answers: { ...baseAnswers, automationFramework: "playwright-java" },
      });
      expect(existsSync(join(javaProject.dir, guidelineRel("page-object-conventions"))), "deploys for playwright-java").toBe(true);
    } finally {
      javaProject.cleanup();
    }

    // Absent for a non-Playwright stack (RestAssured/JVM).
    const jvmProject = tempProject();
    try {
      scaffold({
        root: jvmProject.dir,
        adapter: claudeAdapter,
        stack: { ...baseStack, language: "java", buildTool: "maven", frameworks: ["restassured"], primaryFramework: "restassured", manifests: ["pom.xml"] },
        answers: { ...baseAnswers, automationFramework: "restassured" },
      });
      expect(existsSync(join(jvmProject.dir, guidelineRel("page-object-conventions"))), "absent for restassured").toBe(false);
    } finally {
      jvmProject.cleanup();
    }
  });

  it("parity: both adapters deploy the identical guideline name set", () => {
    const a = tempProject();
    const b = tempProject();
    try {
      scaffold({ root: a.dir, adapter: claudeAdapter, stack: baseStack, answers: baseAnswers });
      scaffold({ root: b.dir, adapter: copilotAdapter, stack: baseStack, answers: baseAnswers });
      const ma = JSON.parse(readFileSync(join(a.dir, "context/.scaffold/manifest.json"), "utf8"));
      const mb = JSON.parse(readFileSync(join(b.dir, "context/.scaffold/manifest.json"), "utf8"));
      expect(ma.choices.guidelines).toEqual(mb.choices.guidelines);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
