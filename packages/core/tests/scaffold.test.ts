import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      ".ai/guidelines/diagram-conventions.md",
      ".ai/guidelines/documentation-as-code.md",
      ".ai/guidelines/spec-driven-development.md",
      ".ai/guidelines/environment-management.md",
      "context/foundation/test-strategy.md",
      "context/foundation/tools.md",
      "context/foundation/repo-map.md",
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

  it("ships the Mermaid diagram-conventions guideline on both platforms; doctor expects it (R-025)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/diagram-conventions.md"), "utf8");
    expect(claude).toContain("mermaid");
    expect(claude).toContain("flowchart");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/diagram-conventions.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("mermaid");
    } finally {
      copilotProject.cleanup();
    }
  });

  it("adopts the C4 architecture standard: reference templates + diagram-conventions mapping + skill (R-032)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });

    // C4-structured reference templates are scaffolded and the index links to them.
    for (const rel of [
      "context/reference/system-overview.md",
      "context/reference/c4-context.md",
      "context/reference/c4-container.md",
      "context/reference/c4-component.md",
    ]) {
      expect(existsSync(join(project.dir, rel)), rel).toBe(true);
    }
    const index = readFileSync(join(project.dir, "context/reference/system-overview.md"), "utf8");
    expect(index).toContain("C4");
    expect(index).toContain("[c4-context.md](./c4-context.md)");

    // diagram-conventions maps each C4 level to a Mermaid diagram type.
    const diagrams = readFileSync(join(project.dir, ".ai/guidelines/diagram-conventions.md"), "utf8");
    for (const t of ["C4Context", "C4Container", "C4Component"]) expect(diagrams).toContain(t);

    // qa-reverse-engineer emits C4 docs and references the guideline.
    const re = SKILLS.find((s) => s.name === "qa-reverse-engineer");
    expect(re!.body).toContain("C4");
    expect(re!.body).toContain("diagram-conventions");

    // Parity: the C4 mapping ships on Copilot too (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/diagram-conventions.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("C4Container");
      expect(existsSync(join(copilotProject.dir, "context/reference/c4-container.md"))).toBe(true);
    } finally {
      copilotProject.cleanup();
    }
  });

  it("ships the documentation-as-code guideline on both platforms; doctor expects it (R-028)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/documentation-as-code.md"), "utf8");
    // The load-bearing contract: docs versioned in-repo, validated by doctor, synced via CI.
    expect(claude).toContain("doctor");
    expect(claude.toLowerCase()).toContain("version");
    expect(claude).toContain("CI");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/documentation-as-code.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("doctor");
      expect(copilot).toContain("CI");
    } finally {
      copilotProject.cleanup();
    }
  });

  it("ships the grounding rule in the root config + a grounding guideline, referenced by skill procedures (R-029)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });

    // Load-bearing rule lives in the lean root config so it survives compaction.
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).toMatch(/grounding rule/i);
    expect(root).toContain("file:line");

    // A grounding guideline ships on both platforms; only the path differs.
    const claude = readFileSync(join(project.dir, ".ai/guidelines/grounding.md"), "utf8");
    expect(claude.toLowerCase()).toContain("cite");
    expect(claude.toLowerCase()).toContain("uncertain");
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/grounding.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("cite");
    } finally {
      copilotProject.cleanup();
    }

    // The claim-producing skills reference the grounding rule in their procedures.
    for (const name of ["qa-rca", "qa-bug-report", "qa-reverse-engineer", "qa-coverage-gap", "qa-metrics", "qa-review", "qa-ticket-review"]) {
      const skill = SKILLS.find((s) => s.name === name);
      expect(skill, `${name} registered`).toBeDefined();
      expect(skill!.body, `${name} references grounding`).toContain("grounding");
    }
  });

  it("ships the spec-driven-development guideline on both platforms; authoring skills reference it (R-030)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/spec-driven-development.md"), "utf8");
    // The spec-first contract: a documented spec precedes case design, and cases trace to it.
    expect(claude.toLowerCase()).toContain("spec");
    expect(claude).toContain("acceptance criteria");
    expect(claude).toContain("traces to");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/spec-driven-development.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("spec");
    } finally {
      copilotProject.cleanup();
    }

    // The authoring-chain skills reference the spec-driven flow in their procedures.
    for (const name of ["qa-ticket-review", "qa-test-case-design", "qa-test-automate"]) {
      const skill = SKILLS.find((s) => s.name === name);
      expect(skill, `${name} registered`).toBeDefined();
      expect(skill!.body, `${name} references spec-driven-development`).toContain("spec-driven-development");
    }
  });

  it("ships the environment-management guideline on both platforms; doctor expects it (R-035)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/environment-management.md"), "utf8");
    // The load-bearing contract: env-var indirection, never an in-repo secret.
    expect(claude.toLowerCase()).toContain("environment variable");
    expect(claude.toLowerCase()).toContain("secret");
    // Composes with the MCP ${VAR}/${env:VAR} indirection pattern.
    expect(claude).toContain("${env:");
    // Phase-2 slots per the R-026 guideline standard.
    expect(claude).toContain("{{ENV_MGMT_PATTERNS}}");
    expect(claude).toContain("{{PROJECT_ENV_WORKFLOW}}");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/environment-management.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("environment variable");
      expect(copilot.toLowerCase()).toContain("secret");
    } finally {
      copilotProject.cleanup();
    }
  });

  it("scaffolds a fresh phase-1 repo-map inventory of the application layout (R-037)", () => {
    // Lay down a representative multi-module repo *before* scaffolding so the
    // deterministic phase-1 inventory has a real layout to map.
    const mk = (rel: string, content = "") => {
      mkdirSync(join(project.dir, rel, ".."), { recursive: true });
      writeFileSync(join(project.dir, rel), content, "utf8");
    };
    mk("package.json", "{}");
    mk("playwright.config.ts", "export default {}");
    mk("tests/login.spec.ts", "test('x', () => {});");
    mk("services/api/pom.xml", "<project/>");
    mk("src/index.ts", "export {};");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const map = readFileSync(join(project.dir, "context/foundation/repo-map.md"), "utf8");

    // Phase-1 inventory is rendered (no leftover phase-1 placeholder) and captures the layout.
    expect(map).not.toContain("{{REPO_MAP_INVENTORY}}");
    expect(map).toContain("### Modules (build roots)");
    expect(map).toContain("package.json");
    expect(map).toContain("`services/api` — pom.xml");
    expect(map).toContain("### Test directories");
    expect(map).toContain("`tests`");
    expect(map).toContain("### Test & CI configuration");
    expect(map).toContain("`playwright.config.ts`");
    // Phase-2 enrichment slots remain for qa-reverse-engineer.
    expect(map).toContain("{{REPO_MAP_TEST_SOURCE_LINKS}}");
    expect(map).toContain("{{REPO_MAP_ENTRY_POINTS}}");
    // No relative markdown links in the inventory, so it can't trip doctor's link check.
    expect(map).not.toMatch(/\]\(\.\.?\//);

    // qa-reverse-engineer owns the phase-2 sections of the repo map.
    const re = SKILLS.find((s) => s.name === "qa-reverse-engineer");
    expect(re!.writes).toContain("context/foundation/repo-map.md");
    expect(re!.body).toContain("repo-map.md");

    // Parity: the same repo-map content ships on Copilot (platform-agnostic foundation).
    const copilotProject = tempProject();
    try {
      // Identical input layout → identical inventory.
      const mkB = (rel: string, content = "") => {
        mkdirSync(join(copilotProject.dir, rel, ".."), { recursive: true });
        writeFileSync(join(copilotProject.dir, rel), content, "utf8");
      };
      mkB("package.json", "{}");
      mkB("playwright.config.ts", "export default {}");
      mkB("tests/login.spec.ts", "test('x', () => {});");
      mkB("services/api/pom.xml", "<project/>");
      mkB("src/index.ts", "export {};");
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilotMap = readFileSync(join(copilotProject.dir, "context/foundation/repo-map.md"), "utf8");
      expect(copilotMap).toBe(map);
    } finally {
      copilotProject.cleanup();
    }
  });

  it("ships the read-before-you-write rule in the root config; every write skill's procedure opens with it (R-033)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });

    // Standing procedural rule lives in the lean root config.
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).toMatch(/read before you write/i);

    // Every write skill opens its Procedure with the read-first step; read-only skills do not.
    const marker = "**Read first (standing rule):**";
    for (const s of SKILLS) {
      const procedure = s.body.slice(s.body.indexOf("## Procedure"));
      if (s.readOnly) {
        expect(s.body, `${s.name} (read-only) has no read-first step`).not.toContain(marker);
      } else {
        expect(procedure.startsWith(`## Procedure\n> ${marker}`), `${s.name} opens with read-first`).toBe(true);
      }
    }

    // Parity: the rule ships on Copilot too, and a write prompt carries the step.
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilotRoot = readFileSync(join(copilotProject.dir, ".github/copilot-instructions.md"), "utf8");
      expect(copilotRoot).toMatch(/read before you write/i);
      const writePrompt = readFileSync(join(copilotProject.dir, ".github/prompts/qa-test-automate.prompt.md"), "utf8");
      expect(writePrompt).toContain(marker);
    } finally {
      copilotProject.cleanup();
    }
  });

  it("every guideline carries ✅ good / ❌ bad examples on both platforms (R-026)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      for (const name of ["qa-conventions", "grounding", "test-naming", "diagram-conventions", "documentation-as-code", "spec-driven-development", "environment-management"]) {
        const claude = readFileSync(join(project.dir, `.ai/guidelines/${name}.md`), "utf8");
        expect(claude, `claude ${name} good`).toContain("✅");
        expect(claude, `claude ${name} bad`).toContain("❌");
        expect(claude, `claude ${name} patterns`).toContain("## Applicable patterns");
        const copilot = readFileSync(
          join(copilotProject.dir, `.github/instructions/${name}.instructions.md`),
          "utf8",
        );
        expect(copilot, `copilot ${name} good`).toContain("✅");
        expect(copilot, `copilot ${name} bad`).toContain("❌");
      }
    } finally {
      copilotProject.cleanup();
    }
  });

  it("ships qa-playwright-cli as a write automation skill with the write tool allowlist (R-024)", () => {
    const cli = SKILLS.find((s) => s.name === "qa-playwright-cli");
    expect(cli, "qa-playwright-cli registered").toBeDefined();
    expect(cli!.readOnly).toBe(false);
    expect(cli!.bucket).toBe("automation");
    // Wraps real CLI commands, so the body names the core verbs.
    expect(cli!.body).toContain("codegen");
    expect(cli!.body).toContain("show-trace");
    expect(cli!.body).toContain("--update-snapshots");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-playwright-cli/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob, Write, Edit, Bash");
  });

  it("ships qa-ci-pipeline as a write skill that runs the framework and publishes the result dirs (R-027)", () => {
    const ci = SKILLS.find((s) => s.name === "qa-ci-pipeline");
    expect(ci, "qa-ci-pipeline registered").toBeDefined();
    expect(ci!.readOnly).toBe(false);
    expect(ci!.bucket).toBe("automation");
    // Names the three supported CI providers.
    expect(ci!.body).toContain("GitHub Actions");
    expect(ci!.body).toContain("GitLab CI");
    expect(ci!.body).toContain("Azure Pipelines");
    // Publishes into the result dirs the result MCP reads, closing the loop at the CI boundary.
    expect(ci!.body).toContain("./playwright-report");
    expect(ci!.body).toContain("result MCP");
    // Wired from qa-test-automate's ## Next so the flow reaches CI after local green.
    const automate = SKILLS.find((s) => s.name === "qa-test-automate");
    expect(automate!.body).toContain("qa-ci-pipeline");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-ci-pipeline/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob, Write, Edit, Bash");
    // Phase-1 placeholders are rendered with the chosen framework.
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
