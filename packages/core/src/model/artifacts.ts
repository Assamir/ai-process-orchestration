/**
 * R-059 — Artifact template registry: the **single source of shape** for the
 * runtime artifacts under `context/changes/<work-id>/`.
 *
 * The skeleton (`context/foundation`, guidelines, root config) already has its
 * shape seeded in `FOUNDATION`/`GUIDELINES` and its quality enforced
 * deterministically by `doctor`. The runtime artifacts had no such single
 * source — each producing skill described its output shape in its own prose, so
 * a validator would have to re-derive it. This registry lifts that shape into
 * one place, analogous to `GUIDELINES`/`FOUNDATION`, with **parseable, stable
 * trace markers** so the iron QA rule (AC ↔ case ↔ test) can be checked on real
 * files (R-061) instead of asserted as prose.
 *
 * Skill bodies embed a template via `tpl(name)` inside a fenced `## Template`
 * section, so the shape lives here once and renders identically for both
 * adapters (the parity test holds automatically). Scope is strictly
 * `context/changes/<work-id>/*` — foundation/reference are out of scope.
 *
 * **Trace markers** (formalized here, parsed by R-061):
 * - `work.md` — each acceptance criterion as a stable id `- **AC1**: …` (`AC\d+`),
 *   plus YAML frontmatter `status:` (seeded `in-progress`; lifecycle is R-061).
 * - `cases.md` — each case carries `Traces to: AC1[, AC2]` (its `traceField`).
 * - `automation.md` — each test references its case via `Covers: TC1`.
 * - `performance.md` — each NFR traces to an acceptance criterion via `Traces to:`.
 */

export interface ArtifactTemplate {
  /** Stable key, e.g. "cases". Used by `tpl()` and the consistency test. */
  name: string;
  /** Canonical path with the `<work-id>` token — must appear in `producedBy`'s `writes`. */
  pathTemplate: string;
  /** The skill that produces this artifact (must exist in `SKILLS`). */
  producedBy: string;
  /** `##` headers the validator (R-061) requires a filled artifact to keep. */
  requiredSections: string[];
  /** The field carrying this artifact's trace pointer, when it has one (e.g. "Traces to"). */
  traceField?: string;
  /** The canonical, seeded body (no outer code fence — the skill body wraps it). */
  template: string;
}

const WORK_TEMPLATE = `---
status: in-progress
---
# <work-id>: <title>

- **Source:** <ticket link>
- **Goal:** <one sentence — what success looks like>

## Scope
- **In:** <what this work-item covers>
- **Out:** <what it explicitly does not cover>

## Acceptance criteria
- **AC1**: <a single, testable statement>
- **AC2**: <…>`;

const PLAN_TEMPLATE = `# Test plan: <work-id>

## Test levels
<unit / API / E2E in play, and why>

## Risk areas
<where defects are most likely or most costly>

## Data & environments
<test data needs; target environments>

## Steps
1. design — derive cases from the acceptance criteria
2. automate — implement the designed cases
3. run — execute and capture results
4. analyze — triage failures and report coverage

## Assumptions & non-coverage
<assumptions made; what is explicitly NOT covered>`;

const CASES_TEMPLATE = `# Test cases: <work-id>

## TC1: <case title>
- **Traces to:** AC1
- **Test level:** <unit | API | E2E>
- **Preconditions:** <state before the test>
- **Steps:**
  1. <step>
- **Expected result:** <observable outcome>`;

const AUTOMATION_TEMPLATE = `# Automation: <work-id>

## Run
- **Command:** <exact command to run the new tests>
- **Results:** <path to report / trace / JUnit XML>

## Tests
- <test name or file::test> — Covers: TC1

## Result
<pass / fail summary of the recorded run>`;

const PERFORMANCE_TEMPLATE = `# Performance: <work-id>

## NFRs
- **NFR1**: <p95 / p99 / throughput / error-rate budget> — Traces to: AC1

## Plan
- **Plan path:** <plan.jmx>
- **Run command:** jmeter -n -t plan.jmx -l ./jmeter-results/results.jtl -e -o ./jmeter-report
- **Baseline:** <baseline compared against, or "none recorded">

## Results
- **NFR1:** <measured p95/p99 + error-rate from the dashboard/.jtl> — pass | fail`;

const BUG_REPORT_TEMPLATE = `# Bug: <one-line summary>
- **Severity / Priority:** <S1-S4 / P1-P4>
- **Environment:** <env, build/version, browser/runtime>
- **Work-item / AC:** <work-id> · <criterion id>
- **Suspected area (from qa-rca):** <component / module>

## Steps to reproduce
1. <step>

## Expected vs actual
- **Expected:** <...>
- **Actual:** <...>

## Evidence
- <links to trace / screenshot / log via the result MCP server or tools.md paths>`;

/** The runtime artifacts under `context/changes/<work-id>/`, in workflow order. */
export const ARTIFACTS: ArtifactTemplate[] = [
  {
    name: "work",
    pathTemplate: "context/changes/<work-id>/work.md",
    producedBy: "qa-new",
    requiredSections: ["Scope", "Acceptance criteria"],
    template: WORK_TEMPLATE,
  },
  {
    name: "plan",
    pathTemplate: "context/changes/<work-id>/plan.md",
    producedBy: "qa-plan",
    requiredSections: ["Test levels", "Risk areas", "Steps"],
    template: PLAN_TEMPLATE,
  },
  {
    name: "cases",
    pathTemplate: "context/changes/<work-id>/cases.md",
    producedBy: "qa-test-case-design",
    requiredSections: [],
    traceField: "Traces to",
    template: CASES_TEMPLATE,
  },
  {
    name: "automation",
    pathTemplate: "context/changes/<work-id>/automation.md",
    producedBy: "qa-test-automate",
    requiredSections: ["Run", "Tests", "Result"],
    traceField: "Covers",
    template: AUTOMATION_TEMPLATE,
  },
  {
    name: "performance",
    pathTemplate: "context/changes/<work-id>/performance.md",
    producedBy: "qa-performance",
    requiredSections: ["NFRs", "Plan", "Results"],
    traceField: "Traces to",
    template: PERFORMANCE_TEMPLATE,
  },
  {
    name: "bug-report",
    pathTemplate: "context/changes/<work-id>/bug-report.md",
    producedBy: "qa-bug-report",
    requiredSections: ["Steps to reproduce", "Expected vs actual", "Evidence"],
    template: BUG_REPORT_TEMPLATE,
  },
];

const BY_NAME = new Map(ARTIFACTS.map((a) => [a.name, a]));

/**
 * The canonical seeded body for an artifact, for embedding in a skill body's
 * fenced `## Template` section. Throws at module-eval time on an unknown name so
 * a typo in `skills.ts` fails loudly rather than silently emitting nothing.
 */
export function tpl(name: string): string {
  const a = BY_NAME.get(name);
  if (a === undefined) throw new Error(`Unknown artifact template: ${name}`);
  return a.template;
}
