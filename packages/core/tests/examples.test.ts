import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, runDoctor, scaffold } from "../src/index.js";
import type { DetectedStack, WizardAnswers } from "../src/index.js";
import { tempProject } from "./helpers.js";

// Repo root: packages/core/tests → up three levels.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WALKTHROUGH = join(REPO_ROOT, "examples", "README.md");

// The Playwright-TS stack the walkthrough narrates.
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

// The concrete files the walkthrough claims `init` creates.
const CLAIMED_FILES = [
  "CLAUDE.md",
  ".ai/guidelines/qa-conventions.md",
  "context/foundation/test-strategy.md",
  ".claude/skills/qa-init/SKILL.md",
  ".mcp.json",
];

describe("examples walkthrough is test-backed (R-052)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("the walkthrough exists and references the real CLI verbs", () => {
    expect(existsSync(WALKTHROUGH), "examples/README.md exists").toBe(true);
    const md = readFileSync(WALKTHROUGH, "utf8");
    for (const verb of ["init", "doctor", "update"]) {
      expect(md, `walkthrough documents \`${verb}\``).toContain(`claude-qa-orchestrator ${verb}`);
    }
  });

  it("every file the walkthrough claims `init` creates is actually scaffolded — and named in the doc", () => {
    const md = readFileSync(WALKTHROUGH, "utf8");
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    for (const rel of CLAIMED_FILES) {
      expect(existsSync(join(project.dir, rel)), `${rel} is scaffolded`).toBe(true);
      expect(md, `${rel} is named in the walkthrough`).toContain(rel);
    }
  });

  it("`doctor` passes on the scaffold the walkthrough produces (no errors)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.errorCount, "scaffold is doctor-clean").toBe(0);
    expect(report.ok).toBe(true);
  });
});
