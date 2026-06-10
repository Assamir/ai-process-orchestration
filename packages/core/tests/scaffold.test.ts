import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, copilotAdapter, scaffold, SKILLS } from "../src/index.js";
import type { DetectedStack, WizardAnswers } from "../src/index.js";
import { tempProject } from "./helpers.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint", "prettier"],
  observability: [],
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

describe("scaffold (Claude)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("creates the root config, guidelines, context/, skills, mcp, and manifest", () => {
    const results = scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    for (const r of results) expect(r.status).toBe("created");

    const expected = [
      "CLAUDE.md",
      ".ai/guidelines/qa-conventions.md",
      ".ai/guidelines/test-naming.md",
      "context/foundation/test-strategy.md",
      "context/foundation/tools.md",
      ".claude/skills/qa-init/SKILL.md",
      ".claude/skills/qa-rca/SKILL.md",
      ".mcp.json",
      "context/.scaffold/manifest.json",
    ];
    for (const rel of expected) expect(existsSync(join(project.dir, rel)), rel).toBe(true);
  });

  it("fills the iron QA rule with the chosen framework", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).toContain("Playwright (TypeScript)");
    expect(root).not.toContain("{{AUTOMATION_FRAMEWORK}}");
  });

  it("renders read-only skills without write tools", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const rca = readFileSync(join(project.dir, ".claude/skills/qa-rca/SKILL.md"), "utf8");
    expect(rca).toContain("allowed-tools: Read, Grep, Glob");
    expect(rca).not.toContain("Write, Edit, Bash");
  });

  it("ships the gardening maintenance skill as read-only (R-004)", () => {
    const gardening = SKILLS.find((s) => s.name === "qa-gardening");
    expect(gardening, "gardening skill registered").toBeDefined();
    expect(gardening!.readOnly).toBe(true);
    expect(gardening!.bucket).toBe("analysis");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-gardening/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob");
    expect(skill).not.toContain("Write, Edit, Bash");
  });

  it("renders each skill's suggested model into SKILL.md frontmatter (R-014)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // Heavy-reasoning skill -> opus; mechanical skill -> haiku.
    const plan = readFileSync(join(project.dir, ".claude/skills/qa-plan/SKILL.md"), "utf8");
    expect(plan).toContain("model: opus");
    const archive = readFileSync(join(project.dir, ".claude/skills/qa-archive/SKILL.md"), "utf8");
    expect(archive).toContain("model: haiku");
    // The matrix is total: every logical skill declares a valid tier.
    for (const s of SKILLS) expect(["opus", "sonnet", "haiku"]).toContain(s.suggestedModel);
  });

  it("ships qa-bug-report and qa-reverse-engineer and scaffolds context/reference/ (R-018, R-019)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(existsSync(join(project.dir, ".claude/skills/qa-bug-report/SKILL.md")), "qa-bug-report").toBe(true);
    expect(existsSync(join(project.dir, ".claude/skills/qa-reverse-engineer/SKILL.md")), "qa-reverse-engineer").toBe(true);
    expect(existsSync(join(project.dir, "context/reference/system-overview.md")), "reference index").toBe(true);
    const bugReport = SKILLS.find((s) => s.name === "qa-bug-report");
    expect(bugReport!.writes).toContain("context/changes/<work-id>/bug-report.md");
  });

  it("every skill suggests a flow via a ## Next section (R-020)", () => {
    for (const s of SKILLS) expect(s.body, s.name).toContain("## Next");
  });

  it("qa-test-data-gen emits reusable, schema-valid factories referenced from cases (R-010)", () => {
    const dataGen = SKILLS.find((s) => s.name === "qa-test-data-gen");
    expect(dataGen, "qa-test-data-gen registered").toBeDefined();
    const body = dataGen!.body;
    expect(body).toMatch(/factor(y|ies)/i);
    expect(body).toMatch(/fixture/i);
    expect(body).toMatch(/schema/i);
    // Generated data must be traceable to a case, not inline literals.
    expect(body).toContain("cases.md");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-test-data-gen/SKILL.md"), "utf8");
    // Stack-aware tooling rendered with the chosen framework.
    expect(skill).toContain("@faker-js/faker");
    expect(skill).toContain("Playwright (TypeScript)");
    expect(skill).not.toContain("{{AUTOMATION_FRAMEWORK}}");
  });

  it("ships qa-metrics as a read-only observability/metrics digest skill (R-012)", () => {
    const metrics = SKILLS.find((s) => s.name === "qa-metrics");
    expect(metrics, "qa-metrics registered").toBeDefined();
    expect(metrics!.readOnly).toBe(true);
    expect(metrics!.bucket).toBe("analysis");
    expect(metrics!.writes).toEqual([]);

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-metrics/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob");
    expect(skill).not.toContain("Write, Edit, Bash");
    // Aggregates run health + coverage, and reaches past a single static report dir.
    expect(skill).toMatch(/flak/i);
    expect(skill).toContain("Allure");
  });

  it("ships qa-coverage-gap as a read-only AC↔case↔test traceability skill (R-022)", () => {
    const gap = SKILLS.find((s) => s.name === "qa-coverage-gap");
    expect(gap, "qa-coverage-gap registered").toBeDefined();
    expect(gap!.readOnly).toBe(true);
    expect(gap!.bucket).toBe("analysis");
    expect(gap!.writes).toEqual([]);
    expect(gap!.reads).toContain("context/changes/<work-id>/work.md");
    expect(gap!.reads).toContain("context/changes/<work-id>/cases.md");
    expect(gap!.reads).toContain("context/changes/<work-id>/automation.md");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-coverage-gap/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob");
    expect(skill).not.toContain("Write, Edit, Bash");
  });

  it("scaffolds the tech-debt-tracker foundation doc and qa-archive writes to it (R-005)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const tracker = join(project.dir, "context/foundation/tech-debt-tracker.md");
    expect(existsSync(tracker), "tech-debt-tracker.md scaffolded").toBe(true);
    expect(readFileSync(tracker, "utf8")).toContain("Tech-debt tracker");

    const archive = SKILLS.find((s) => s.name === "qa-archive");
    expect(archive!.writes).toContain("context/foundation/tech-debt-tracker.md");
  });

  it("writes a valid manifest listing every skill", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const manifest = JSON.parse(readFileSync(join(project.dir, "context/.scaffold/manifest.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.platform).toBe("claude");
    expect(manifest.skills).toEqual(SKILLS.map((s) => s.name));
  });

  it("is idempotent: a second run skips everything", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const second = scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    for (const r of second) expect(r.status).toBe("skipped");
  });
});

describe("scaffold (Copilot)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("creates the Copilot surface", () => {
    scaffold({ root: project.dir, adapter: copilotAdapter, stack, answers });
    const expected = [
      ".github/copilot-instructions.md",
      ".github/instructions/qa-conventions.instructions.md",
      ".github/prompts/qa-init.prompt.md",
      ".github/agents/qa-orchestrator.agent.md",
      ".vscode/mcp.json",
      "context/foundation/test-strategy.md",
    ];
    for (const rel of expected) expect(existsSync(join(project.dir, rel)), rel).toBe(true);
  });

  it("keeps the suggested model documentation-only — no model: field in prompts (R-014)", () => {
    scaffold({ root: project.dir, adapter: copilotAdapter, stack, answers });
    const prompt = readFileSync(join(project.dir, ".github/prompts/qa-plan.prompt.md"), "utf8");
    expect(prompt).not.toContain("model:");
  });
});

describe("parity between platforms", () => {
  let a: ReturnType<typeof tempProject>;
  let b: ReturnType<typeof tempProject>;
  beforeEach(() => {
    a = tempProject();
    b = tempProject();
  });
  afterEach(() => {
    a.cleanup();
    b.cleanup();
  });

  it("emits the same skill set and an identical context/ skeleton", () => {
    scaffold({ root: a.dir, adapter: claudeAdapter, stack, answers });
    scaffold({ root: b.dir, adapter: copilotAdapter, stack, answers });

    for (const s of SKILLS) {
      expect(existsSync(join(a.dir, `.claude/skills/${s.name}/SKILL.md`)), `claude ${s.name}`).toBe(true);
      expect(existsSync(join(b.dir, `.github/prompts/${s.name}.prompt.md`)), `copilot ${s.name}`).toBe(true);
    }

    // The system of record is platform-agnostic: identical content.
    const rel = "context/foundation/test-strategy.md";
    expect(readFileSync(join(a.dir, rel), "utf8")).toBe(readFileSync(join(b.dir, rel), "utf8"));
  });
});
