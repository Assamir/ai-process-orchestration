import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, copilotAdapter, runDoctor, scaffold } from "../src/index.js";
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

describe("runDoctor", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("passes a fresh scaffold (no errors; warns about phase-2 placeholders)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.findings.some((f) => f.id === "PHASE2:remaining" && f.severity === "warn")).toBe(true);
  });

  it("flags a missing expected file as an error", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    rmSync(join(project.dir, ".mcp.json"));
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "STRUCT:.mcp.json")).toBe(true);
  });

  it("flags an unrendered phase-1 placeholder as an error", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    appendFileSync(join(project.dir, "CLAUDE.md"), "\nleftover {{AUTOMATION_FRAMEWORK}}\n");
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id.startsWith("PHASE1:") && f.severity === "error")).toBe(true);
  });

  it("flags a broken relative link", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    appendFileSync(join(project.dir, ".ai/guidelines/qa-conventions.md"), "\nSee [missing](./does-not-exist.md).\n");
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id.startsWith("LINK:") && f.severity === "error")).toBe(true);
  });

  it("flags a guideline missing its good/bad examples (R-026)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Overwrite a guideline with content that drops the ✅/❌ example sections.
    writeFileSync(
      join(project.dir, ".ai/guidelines/test-naming.md"),
      "# Test naming\n\nNames state behavior and outcome.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "GUIDELINE:examples:test-naming" && f.severity === "error")).toBe(
      true,
    );
  });

  it("flags a gutted documentation-as-code guideline that drops its doctor/CI contract (R-028)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Overwrite with content that keeps the ✅/❌ markers but drops the doctor + CI contract.
    writeFileSync(
      join(project.dir, ".ai/guidelines/documentation-as-code.md"),
      "# Documentation as code\n\nWrite docs. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "DOCASCODE:contract" && f.severity === "error")).toBe(true);
  });

  it("flags a root config that drops the grounding rule (R-029)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Rewrite the root config without the grounding rule (keep the iron QA rule).
    writeFileSync(
      join(project.dir, "CLAUDE.md"),
      "# QA orchestration\n\n## Iron QA rule\n\nTests in the framework.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "GROUNDING:missing" && f.severity === "error")).toBe(true);
  });

  it("flags a gutted grounding guideline that drops its cite/uncertainty contract (R-029)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Keep the ✅/❌ markers but drop the cite + uncertainty contract.
    writeFileSync(
      join(project.dir, ".ai/guidelines/grounding.md"),
      "# Grounding\n\nGround claims. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "GROUNDING:contract" && f.severity === "error")).toBe(true);
  });

  it("flags a grounding guideline that drops the evidence-collection standard (R-045)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Keep the ✅/❌ markers plus cite + uncertainty, but drop the evidence standard.
    writeFileSync(
      join(project.dir, ".ai/guidelines/grounding.md"),
      "# Grounding\n\nCite sources and flag uncertainty. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "GROUNDING:contract" && f.severity === "error")).toBe(true);
  });

  it("flags a gutted environment-management guideline that drops its secrets/env-var contract (R-035)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Keep the ✅/❌ markers but drop the env-var indirection + no-committed-secrets contract.
    writeFileSync(
      join(project.dir, ".ai/guidelines/environment-management.md"),
      "# Environment management\n\nUse environments. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "ENVMGMT:contract" && f.severity === "error")).toBe(true);
  });

  it("flags a gutted code-formatting guideline that drops its @formatter guards (R-054)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Keep the ✅/❌ markers but drop the @formatter:off/on autoformatter safeguard.
    writeFileSync(
      join(project.dir, ".ai/guidelines/code-formatting.md"),
      "# Code formatting\n\nRun the formatter. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "FORMATTER:guards" && f.severity === "error")).toBe(true);
  });

  it("warns (not errors) when the read-before-you-write rule is dropped from the root config (R-033)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Rewrite the root config keeping the load-bearing rules but dropping the read-first rule.
    writeFileSync(
      join(project.dir, "CLAUDE.md"),
      "# QA orchestration\n\n## Iron QA rule\n\nTests in the framework.\n\n## Grounding rule\n\nCite file:line.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    const finding = report.findings.find((f) => f.id === "READFIRST:missing");
    expect(finding, "READFIRST:missing present").toBeDefined();
    expect(finding!.severity).toBe("warn");
    // Optional check: it must not, on its own, make the scaffold fail.
    expect(report.findings.some((f) => f.id === "READFIRST:missing" && f.severity === "error")).toBe(false);
  });

  it("flags a gutted documentation guideline that drops its frontmatter/when-to-use/length contract (R-069)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Keep the ✅/❌ markers but drop the meta-standard contract.
    writeFileSync(
      join(project.dir, ".ai/guidelines/documentation.md"),
      "# Documentation standard\n\nWrite good docs. ✅ good ❌ bad.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.id === "DOCSTD:contract" && f.severity === "error")).toBe(true);
  });

  it("flags a durable doc missing its required frontmatter (R-069)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Strip the frontmatter from a durable foundation doc.
    writeFileSync(
      join(project.dir, "context/foundation/tools.md"),
      "# Tools & result artifacts\n\nNo frontmatter here.\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(
      report.findings.some(
        (f) => f.id === "DOCSTD:frontmatter:context/foundation/tools.md" && f.severity === "error",
      ),
    ).toBe(true);
  });

  it("warns when a runtime artifact's built-on omits a required pillar (R-070)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // A filled cases.md that rests on P1 (which exists) but names no P2 doc.
    mkdirSync(join(project.dir, "context/changes/api-login"), { recursive: true });
    writeFileSync(
      join(project.dir, "context/changes/api-login/cases.md"),
      "---\nstatus: in-progress\nwork-id: api-login\nbuilt-on:\n  - context/reference/system-overview.md\n---\n# Test cases\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    // Missing P2 is a warn (not an error — the hard gate folds into R-061).
    const warn = report.findings.find(
      (f) => f.id === "BUILTON:pillar:context/changes/api-login/cases.md:P2",
    );
    expect(warn, "P2 pillar warn present").toBeDefined();
    expect(warn!.severity).toBe("warn");
    // P1 is satisfied (system-overview.md exists) → no P1 warn.
    expect(report.findings.some((f) => f.id.endsWith("cases.md:P1"))).toBe(false);
  });

  it("errors on a broken pillar-provenance link (R-070)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    mkdirSync(join(project.dir, "context/changes/api-login"), { recursive: true });
    writeFileSync(
      join(project.dir, "context/changes/api-login/automation.md"),
      "---\nstatus: in-progress\nwork-id: api-login\nbuilt-on:\n  - context/foundation/does-not-exist.md\n---\n# Automation\n",
    );
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.ok).toBe(false);
    expect(
      report.findings.some((f) => f.id.startsWith("BUILTON:link:") && f.severity === "error"),
    ).toBe(true);
  });

  it("detects a platform mismatch via the manifest", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, copilotAdapter);
    expect(report.findings.some((f) => f.id === "MANIFEST:platform")).toBe(true);
  });
});
