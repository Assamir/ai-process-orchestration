import { appendFileSync, rmSync } from "node:fs";
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
  manifests: ["package.json"],
};

const answers: WizardAnswers = {
  atlassianMcp: false,
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

  it("detects a platform mismatch via the manifest", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, copilotAdapter);
    expect(report.findings.some((f) => f.id === "MANIFEST:platform")).toBe(true);
  });
});
