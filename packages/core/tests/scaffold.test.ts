import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARTIFACTS, claudeAdapter, copilotAdapter, GUIDELINES, scaffold, SKILLS } from "../src/index.js";
import type { DetectedStack, WizardAnswers } from "../src/index.js";
import { tempProject } from "./helpers.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint", "prettier"],
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
      ".ai/guidelines/grounding.md",
      ".ai/guidelines/assumptions.md",
      ".ai/guidelines/test-naming.md",
      ".ai/guidelines/diagram-conventions.md",
      ".ai/guidelines/documentation-as-code.md",
      ".ai/guidelines/spec-driven-development.md",
      ".ai/guidelines/environment-management.md",
      ".ai/guidelines/test-data-management.md",
      // (R-091) performance-testing / mcp-content-fetch / multi-repo-boundaries are
      // stack-aware and NOT deployed on this default single-repo, no-JMeter,
      // no-fetch-MCP scaffold — see the dedicated R-091 test below.
      ".ai/guidelines/code-formatting.md",
      ".ai/guidelines/documentation.md",
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

  it("ships the assumptions guideline on both platforms; claim-producing skills reference it (R-044)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/assumptions.md"), "utf8");
    // The protocol contract: inference is legal only inside a `## Assumptions` table.
    expect(claude).toContain("## Assumptions");
    // The required columns, the inline reference convention, and calibration.
    for (const col of ["ID", "Claim", "Basis", "Impact", "Verification", "Confidence"]) {
      expect(claude, `assumptions column ${col}`).toContain(col);
    }
    expect(claude).toContain("(A1)");
    expect(claude.toLowerCase()).toContain("high confidence is rare");
    // It complements grounding, not duplicates it.
    expect(claude).toContain("grounding");
    // Phase-2 slots per the R-026 guideline standard.
    expect(claude).toContain("{{ASSUMPTIONS_PATTERNS}}");
    expect(claude).toContain("{{PROJECT_ASSUMPTIONS_WORKFLOW}}");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/assumptions.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("## Assumptions");
      expect(copilot).toContain("(A1)");
    } finally {
      copilotProject.cleanup();
    }

    // The claim-producing skills reference the assumptions protocol by name.
    for (const name of ["qa-ticket-review", "qa-rca", "qa-bug-report", "qa-coverage-gap", "qa-reverse-engineer"]) {
      const skill = SKILLS.find((s) => s.name === name);
      expect(skill, `${name} registered`).toBeDefined();
      expect(skill!.body, `${name} references assumptions`).toContain("assumptions");
    }
  });

  it("upgrades grounding into the evidence-collection standard: ranked types, min-context, identifier scrub (R-045)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/grounding.md"), "utf8");
    // The ranked evidence-type table — source code is the strongest.
    expect(claude).toContain("Evidence types (ranked");
    expect(claude).toContain("Strongest");
    // The minimum-context rule for code citations.
    expect(claude.toLowerCase()).toContain("minimum context");
    expect(claude).toContain("10 lines");
    // The identifier scrub checklist.
    expect(claude.toLowerCase()).toContain("identifier scrub");
    // It still keeps the original cite/uncertainty contract (doctor enforces all three).
    expect(claude.toLowerCase()).toContain("cite");
    expect(claude.toLowerCase()).toContain("uncertain");
    expect(claude.toLowerCase()).toContain("evidence");

    // Parity on Copilot.
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/grounding.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("Evidence types (ranked");
      expect(copilot.toLowerCase()).toContain("identifier scrub");
    } finally {
      copilotProject.cleanup();
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

  it("ships the test-data-management guideline on both platforms; data skills reference it (R-036)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const claude = readFileSync(join(project.dir, ".ai/guidelines/test-data-management.md"), "utf8");
    // The data-lifecycle contract: isolation between tests/runs and cleanup.
    expect(claude.toLowerCase()).toContain("isolat");
    expect(claude.toLowerCase()).toContain("clean");
    expect(claude.toLowerCase()).toContain("seed");
    // Composes with environment-management (no real PII, like a committed secret).
    expect(claude).toContain("environment-management");
    // Phase-2 slots per the R-026 guideline standard.
    expect(claude).toContain("{{TEST_DATA_PATTERNS}}");
    expect(claude).toContain("{{PROJECT_TEST_DATA_WORKFLOW}}");

    // Parity: the same guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/test-data-management.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("isolat");
      expect(copilot.toLowerCase()).toContain("clean");
    } finally {
      copilotProject.cleanup();
    }

    // The data skills reference the guideline by name in their procedures.
    for (const name of ["qa-test-data-gen", "qa-test-automate"]) {
      const skill = SKILLS.find((s) => s.name === name);
      expect(skill, `${name} registered`).toBeDefined();
      expect(skill!.body, `${name} references test-data-management`).toContain("test-data-management");
    }
  });

  it("ships qa-performance as a write skill enforcing NFRs + a performance-testing guideline (R-046, R-047)", () => {
    // The skill is a write/automation skill (it authors a .jmx plan + records results).
    const perf = SKILLS.find((s) => s.name === "qa-performance");
    expect(perf, "qa-performance registered").toBeDefined();
    expect(perf!.readOnly).toBe(false);
    expect(perf!.bucket).toBe("automation");
    // It is JMeter-first, headless, percentile-based, and traces to NFRs.
    expect(perf!.body).toContain("jmeter -n");
    expect(perf!.body).toMatch(/p95/);
    expect(perf!.body).toContain("performance-testing");
    expect(perf!.body).toContain("jmeter-results");

    // (R-091) performance-testing is stack-aware: it deploys only when a perf tool
    // (JMeter) is detected. Scaffold with a JMeter stack so the guideline ships.
    const perfStack: DetectedStack = { ...stack, performance: ["jmeter"] };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: perfStack, answers });
    // Rendered with the write tool allowlist on Claude.
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-performance/SKILL.md"), "utf8");
    expect(skill).toContain("Write, Edit, Bash");

    // The performance-testing guideline ships with the load-testing contract.
    const claude = readFileSync(join(project.dir, ".ai/guidelines/performance-testing.md"), "utf8");
    expect(claude.toLowerCase()).toContain("nfr");
    expect(claude).toContain("p95");
    expect(claude.toLowerCase()).toContain("baseline");
    expect(claude).toContain("{{PERF_PATTERNS}}");
    expect(claude).toContain("{{PROJECT_PERF_WORKFLOW}}");

    // Parity: the guideline + skill ship on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack: perfStack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/performance-testing.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("nfr");
      expect(existsSync(join(copilotProject.dir, ".github/prompts/qa-performance.prompt.md"))).toBe(true);
    } finally {
      copilotProject.cleanup();
    }

    // Wired from the automation chain's ## Next.
    for (const name of ["qa-test-automate", "qa-ci-pipeline"]) {
      const s = SKILLS.find((x) => x.name === name);
      expect(s!.body, `${name} references qa-performance`).toContain("qa-performance");
    }
  });

  it("ships the code-formatting guideline + wraps the diagram fences in @formatter guards (R-054)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const fmt = readFileSync(join(project.dir, ".ai/guidelines/code-formatting.md"), "utf8");
    // The load-bearing safeguard: the generalized @formatter:off/on autoformatter guards.
    expect(fmt).toContain("@formatter:off");
    expect(fmt).toContain("@formatter:on");
    // Deterministic formatting + import-order contract.
    expect(fmt.toLowerCase()).toContain("import order");
    expect(fmt.toLowerCase()).toContain("source of truth");
    // Composes with diagram-conventions and surfaces the detected formatters/linters
    // (LINTERS is a phase-1 var → rendered to the detected value, no leftover placeholder).
    expect(fmt).toContain("diagram-conventions");
    expect(fmt).toContain("eslint");
    expect(fmt).not.toContain("{{LINTERS}}");
    // Phase-2 slots per the R-026 guideline standard.
    expect(fmt).toContain("{{FORMATTER_PATTERNS}}");
    expect(fmt).toContain("{{PROJECT_FORMATTING_WORKFLOW}}");

    // The diagram-conventions guideline's example fences are now born compliant —
    // every rendered Mermaid block is wrapped in the formatter guard.
    const diagrams = readFileSync(join(project.dir, ".ai/guidelines/diagram-conventions.md"), "utf8");
    expect(diagrams).toContain("<!-- @formatter:off -->");
    expect(diagrams).toContain("<!-- @formatter:on -->");
    expect(diagrams).toContain("code-formatting");
    // Each rendered mermaid fence is preceded by an off-guard.
    const offGuards = (diagrams.match(/<!-- @formatter:off -->\n```mermaid/g) ?? []).length;
    expect(offGuards, "every mermaid fence guarded").toBeGreaterThanOrEqual(2);

    // Parity: the guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/code-formatting.instructions.md"),
        "utf8",
      );
      expect(copilot).toContain("@formatter:off");
      expect(copilot).toContain("@formatter:on");
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
        // The (R-085) multi-repo write-boundary placeholder precedes the read-first
        // step; it renders to "" on a single-repo scaffold, so the rendered SKILL.md
        // still opens with the read-first rule.
        expect(procedure.startsWith(`## Procedure\n{{MULTI_REPO_RULE}}> ${marker}`), `${s.name} opens with read-first`).toBe(true);
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
    // (R-091) Scaffold with a stack/choices that deploys the conditional guidelines
    // too (JMeter → performance-testing; a fetch MCP → mcp-content-fetch), so the
    // ✅/❌ contract is asserted across every guideline, not just the universal ones.
    const fullStack: DetectedStack = { ...stack, performance: ["jmeter"] };
    const fullAnswers: WizardAnswers = { ...answers, atlassianMcp: true };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: fullStack, answers: fullAnswers });
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack: fullStack, answers: fullAnswers });
      for (const name of ["qa-conventions", "grounding", "assumptions", "test-naming", "diagram-conventions", "documentation-as-code", "documentation", "spec-driven-development", "environment-management", "test-data-management", "performance-testing", "code-formatting", "mcp-content-fetch"]) {
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

  it("qa-ci-pipeline wires doctor as a PR gate, closing the docs-as-code loop in CI (R-051)", () => {
    const ci = SKILLS.find((s) => s.name === "qa-ci-pipeline");
    expect(ci, "qa-ci-pipeline registered").toBeDefined();
    // The skill now runs the scaffolder's own validator as a pull-request gate.
    expect(ci!.body).toContain("doctor");
    expect(ci!.body).toMatch(/pull-request gate|PR gate/);
    expect(ci!.body).toContain("update --dry-run");
    // It delivers the promise the documentation-as-code guideline already makes.
    expect(ci!.body).toContain("documentation-as-code");
    // The one-line description advertises the gate (handoff list / frontmatter).
    expect(ci!.description).toContain("doctor");

    // The documentation-as-code guideline's promise ("doctor in CI, wired by
    // qa-ci-pipeline") is now actually fulfilled by the skill.
    const docAsCode = GUIDELINES.find((g) => g.name === "documentation-as-code");
    expect(docAsCode!.body).toContain("qa-ci-pipeline");
    expect(docAsCode!.body).toContain("doctor");
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

  it("the artifact registry is consistent with the producing skills (R-059)", () => {
    for (const a of ARTIFACTS) {
      const skill = SKILLS.find((s) => s.name === a.producedBy);
      expect(skill, `${a.name}: producedBy ${a.producedBy}`).toBeDefined();
      // The shape lives once in the registry and the producing skill declares the
      // path it writes — so a future validator (R-061) never re-derives the shape.
      expect(skill!.writes, `${a.name} path in ${a.producedBy}.writes`).toContain(a.pathTemplate);
      expect(skill!.body, `${a.producedBy} embeds the ${a.name} template`).toContain(a.template);
    }
  });

  it("plan.md is the 3-perspective living plan (R-062)", () => {
    const plan = ARTIFACTS.find((a) => a.name === "plan")!;
    expect(plan.requiredSections).toEqual(["Business view", "Architecture view", "Implementation view"]);
    for (const h of ["## Business view", "## Architecture view", "## Implementation view"]) {
      expect(plan.template, h).toContain(h);
    }
    // Coverage overview, a TC summary, and a guarded Mermaid dependency diagram.
    expect(plan.template).toContain("Coverage overview");
    expect(plan.template).toContain("<!-- @formatter:off -->");
    expect(plan.template).toContain("Traces to:");
    const qaPlan = SKILLS.find((s) => s.name === "qa-plan")!;
    expect(qaPlan.body).toContain("Business view");
    expect(qaPlan.body).toContain(plan.template);
  });

  it("cases.md is the detailed executable layer (R-063)", () => {
    const cases = ARTIFACTS.find((a) => a.name === "cases")!;
    for (const f of ["Type:", "Priority:", "Test level:", "Test data:", "Variants"]) {
      expect(cases.template, f).toContain(f);
    }
    expect(cases.template).toContain("Traces to:");
    const design = SKILLS.find((s) => s.name === "qa-test-case-design")!;
    expect(design.reads).toContain("context/changes/<work-id>/plan.md");
  });

  it("qa-bug-report writes a dual .md + .jira output via the shared conversion (R-064)", () => {
    const bug = SKILLS.find((s) => s.name === "qa-bug-report")!;
    expect(bug.readOnly).toBe(false);
    expect(bug.writes).toContain("context/changes/<work-id>/bug-report.jira");
    // The enriched report carries the service-behavior sections.
    const tplBug = ARTIFACTS.find((a) => a.name === "bug-report")!;
    for (const h of ["## Observations / logs", "## Root cause summary", "## Regression risk"]) {
      expect(tplBug.template, h).toContain(h);
    }
  });

  it("wires the opt-in xray + markitdown fetch servers and the mcp-content-fetch guideline (R-065)", () => {
    // (R-091) mcp-content-fetch is stack-aware: it deploys only when a fetch/ticket
    // MCP is enabled. Off the default scaffold the guideline is absent; with a fetch
    // MCP it ships on both platforms.
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(existsSync(join(project.dir, ".ai/guidelines/mcp-content-fetch.md"))).toBe(false);

    const optInGuide = tempProject();
    try {
      scaffold({ root: optInGuide.dir, adapter: claudeAdapter, stack, answers: { ...answers, markitdownMcp: true } });
      const guide = readFileSync(join(optInGuide.dir, ".ai/guidelines/mcp-content-fetch.md"), "utf8");
      expect(guide.toLowerCase()).toContain("download");
      expect(guide).toContain("markitdown");
      expect(guide).toContain("xray");
      expect(guide).toContain("{{MCP_FETCH_PATTERNS}}");
    } finally {
      optInGuide.cleanup();
    }

    // Opt-in: both servers absent by default, present when chosen, no literal secrets.
    const off = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(off.mcpServers.xray).toBeUndefined();
    expect(off.mcpServers.markitdown).toBeUndefined();

    const optIn = tempProject();
    try {
      scaffold({
        root: optIn.dir,
        adapter: claudeAdapter,
        stack,
        answers: { ...answers, xrayMcp: true, markitdownMcp: true },
      });
      const mcp = JSON.parse(readFileSync(join(optIn.dir, ".mcp.json"), "utf8"));
      expect(mcp.mcpServers.xray.env.XRAY_CLIENT_ID).toBe("${XRAY_CLIENT_ID}");
      expect(mcp.mcpServers.markitdown.args).toEqual(["markitdown-mcp"]);
    } finally {
      optIn.cleanup();
    }
  });

  it("qa-ticket-review is a write skill producing a dual-output refinement (R-066)", () => {
    const tr = SKILLS.find((s) => s.name === "qa-ticket-review")!;
    expect(tr.readOnly).toBe(false);
    expect(tr.writes).toContain("context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.md");
    expect(tr.writes).toContain("context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.jira");
    // Still references the rules the claim-producing tests expect.
    for (const ref of ["grounding", "assumptions", "spec-driven-development", "mcp-content-fetch"]) {
      expect(tr.body, ref).toContain(ref);
    }
    const refinement = ARTIFACTS.find((a) => a.name === "refinement")!;
    expect(refinement.producedBy).toBe("qa-ticket-review");
    expect(refinement.requiredSections).toEqual(["Context", "Recommendation", "Acceptance criteria"]);
    expect(tr.body).toContain(refinement.template);

    // The standalone refinements area is scaffolded.
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(existsSync(join(project.dir, "context/refinements/.gitkeep"))).toBe(true);
  });

  it("scaffolds the test-framework foundation doc owned by qa-automation-bootstrapper (R-067)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const tf = readFileSync(join(project.dir, "context/foundation/test-framework.md"), "utf8");
    for (const h of ["## Stack", "## How to run", "## Conventions"]) expect(tf, h).toContain(h);
    // Phase-1 stack vars are rendered (no leftover phase-1 placeholder).
    expect(tf).toContain("Playwright (TypeScript)");
    expect(tf).not.toContain("{{AUTOMATION_FRAMEWORK}}");
    const boot = SKILLS.find((s) => s.name === "qa-automation-bootstrapper")!;
    expect(boot.writes).toContain("context/foundation/test-framework.md");
  });

  it("expands the system-overview Test surface into a QA lens (R-068)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const overview = readFileSync(join(project.dir, "context/reference/system-overview.md"), "utf8");
    for (const h of ["Test surface (QA lens)", "### Integration points", "### Entry-point inventory", "### Data model & boundaries"]) {
      expect(overview, h).toContain(h);
    }
    // C4 architecture layer is untouched.
    expect(overview).toContain("[c4-context.md](./c4-context.md)");
  });

  it("enriches the reference with an API/endpoint inventory + completeness check (R-074)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const overview = readFileSync(join(project.dir, "context/reference/system-overview.md"), "utf8");
    expect(overview).toContain("### API / endpoint inventory");
    expect(overview).toContain("### Completeness verification");
    // The completeness check is a grounded self-check (no silently dropped endpoints).
    expect(overview.toLowerCase()).toContain("none silently dropped");
    // qa-reverse-engineer fills both.
    const re = SKILLS.find((s) => s.name === "qa-reverse-engineer")!;
    expect(re.body).toContain("API / endpoint inventory");
    expect(re.body).toContain("Completeness verification");
  });

  it("ships the documentation meta-standard guideline + durable docs born compliant (R-069)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const std = readFileSync(join(project.dir, ".ai/guidelines/documentation.md"), "utf8");
    // The contract doctor enforces: frontmatter, a when-to-use lede, length discipline.
    expect(std.toLowerCase()).toContain("frontmatter");
    expect(std.toLowerCase()).toContain("when to use");
    expect(std.toLowerCase()).toContain("length");
    // It composes the existing guidelines rather than duplicating them.
    for (const ref of ["grounding", "diagram-conventions", "documentation-as-code"]) {
      expect(std, ref).toContain(ref);
    }
    // Tiered: durable vs runtime.
    expect(std).toContain("Durable docs");
    expect(std).toContain("Runtime artifacts");
    // Phase-2 slots per the R-026 guideline standard.
    expect(std).toContain("{{DOCUMENTATION_PATTERNS}}");
    expect(std).toContain("{{PROJECT_DOCUMENTATION_WORKFLOW}}");

    // Every durable foundation/reference doc is born compliant: full frontmatter.
    for (const rel of [
      "context/foundation/test-strategy.md",
      "context/foundation/tools.md",
      "context/foundation/repo-map.md",
      "context/reference/system-overview.md",
      "context/reference/c4-context.md",
    ]) {
      const text = readFileSync(join(project.dir, rel), "utf8");
      expect(text.startsWith("---\n"), `${rel} opens with frontmatter`).toBe(true);
      for (const key of ["title:", "version:", "last-updated:", "owner-skill:", "status:"]) {
        expect(text, `${rel} frontmatter ${key}`).toContain(key);
      }
    }

    // Parity: the guideline ships on Copilot (only the path differs).
    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers });
      const copilot = readFileSync(
        join(copilotProject.dir, ".github/instructions/documentation.instructions.md"),
        "utf8",
      );
      expect(copilot.toLowerCase()).toContain("frontmatter");
      const copilotDoc = readFileSync(join(copilotProject.dir, "context/foundation/tools.md"), "utf8");
      expect(copilotDoc.startsWith("---\n")).toBe(true);
    } finally {
      copilotProject.cleanup();
    }
  });

  it("ships qa-framework-analyze generating the P3 framework-architecture doc (R-071)", () => {
    const fa = SKILLS.find((s) => s.name === "qa-framework-analyze");
    expect(fa, "qa-framework-analyze registered").toBeDefined();
    expect(fa!.readOnly).toBe(false);
    expect(fa!.writes).toContain("context/foundation/framework-architecture.md");
    // It's the framework twin of qa-reverse-engineer (P3, not P1).
    expect(fa!.body).toContain("P3");
    expect(fa!.body).toContain("grounding");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // The skill renders with the write allowlist.
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-framework-analyze/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob, Write, Edit, Bash");

    // The P3 foundation doc is scaffolded, born compliant, and distinct from test-framework.md.
    const fadoc = join(project.dir, "context/foundation/framework-architecture.md");
    expect(existsSync(fadoc), "framework-architecture.md scaffolded").toBe(true);
    const text = readFileSync(fadoc, "utf8");
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain("owner-skill: qa-framework-analyze");
    expect(text).toContain("Base classes");
    expect(text).toContain("Extension points");
    // test-framework.md (R-067) still exists as the hand-authored onboarding guide.
    expect(existsSync(join(project.dir, "context/foundation/test-framework.md"))).toBe(true);

    // qa-test-automate reads the P3 map so its code matches the documented framework.
    const automate = SKILLS.find((s) => s.name === "qa-test-automate")!;
    expect(automate.reads).toContain("context/foundation/framework-architecture.md");
    expect(automate.body).toContain("framework-architecture.md");
  });

  it("ships qa-knowledge building the P2 knowledge base under context/knowledge/ (R-072)", () => {
    const k = SKILLS.find((s) => s.name === "qa-knowledge");
    expect(k, "qa-knowledge registered").toBeDefined();
    expect(k!.readOnly).toBe(false);
    expect(k!.writes).toContain("context/knowledge/<topic>.md");
    // Uses the R-065 fetch layer and grounds every fact.
    expect(k!.body).toContain("mcp-content-fetch");
    expect(k!.body).toContain("grounding");
    // Embeds the registered knowledge template.
    const knowledge = ARTIFACTS.find((a) => a.name === "knowledge")!;
    expect(knowledge.producedBy).toBe("qa-knowledge");
    expect(knowledge.requiredSections).toEqual(["Domain", "Glossary", "Business rules", "Decisions"]);
    expect(k!.body).toContain(knowledge.template);

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    // The skill renders with the write allowlist; the knowledge area is scaffolded.
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-knowledge/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob, Write, Edit, Bash");
    expect(existsSync(join(project.dir, "context/knowledge/.gitkeep")), "knowledge area scaffolded").toBe(true);
    // The root map names the P2 pillar.
    const root = readFileSync(join(project.dir, "CLAUDE.md"), "utf8");
    expect(root).toContain("context/knowledge/");
  });

  it("ships qa-doc-critic as a read-only semantic doc quality gate (R-073)", () => {
    const dc = SKILLS.find((s) => s.name === "qa-doc-critic");
    expect(dc, "qa-doc-critic registered").toBeDefined();
    expect(dc!.readOnly).toBe(true);
    expect(dc!.bucket).toBe("analysis");
    expect(dc!.writes).toEqual([]);
    // Its criteria are the R-069 standard + grounding + assumptions.
    expect(dc!.body).toContain("documentation");
    expect(dc!.body).toContain("grounding");
    expect(dc!.body).toContain("assumptions");
    // Sharp role separation from its siblings.
    for (const sib of ["doctor", "qa-gardening", "qa-review"]) {
      expect(dc!.body, `mentions ${sib}`).toContain(sib);
    }

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-doc-critic/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob");
    expect(skill).not.toContain("Write, Edit, Bash");
  });

  it("ships qa-guidelines as a write backbone skill that fills guideline placeholders, grounded (R-089)", () => {
    const g = SKILLS.find((s) => s.name === "qa-guidelines");
    expect(g, "qa-guidelines registered").toBeDefined();
    expect(g!.readOnly).toBe(false);
    expect(g!.bucket).toBe("backbone");
    // Enforces the grounding + ✅/❌ examples contract and the never-invent escape hatch.
    expect(g!.body).toContain("grounding");
    expect(g!.body).toContain("✅");
    expect(g!.body).toContain("❌");
    expect(g!.body).toContain("file:line");
    expect(g!.body).toContain("TODO (needs human input)");
    // qa-init hands off to it as the next setup step (the flow wiring).
    const init = SKILLS.find((s) => s.name === "qa-init");
    expect(init!.body).toContain("qa-guidelines");

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const skill = readFileSync(join(project.dir, ".claude/skills/qa-guidelines/SKILL.md"), "utf8");
    expect(skill).toContain("allowed-tools: Read, Grep, Glob, Write, Edit, Bash");
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
