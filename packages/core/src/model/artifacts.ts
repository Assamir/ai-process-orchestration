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
  /**
   * Canonical path (work-item-scoped `context/changes/<work-id>/…` or a standalone
   * area like `context/refinements/…`) — must appear in `producedBy`'s `writes`.
   */
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

const PLAN_TEMPLATE = `---
status: in-progress
---
# Test plan: <work-id> — <title>

> Living document. Three perspectives: Business (PO) · Architecture · Implementation (Tester).
> Derives from work.md acceptance criteria; updated in place as work progresses.
> Reads first: spec-driven-development, test-strategy, grounding, assumptions guidelines.

| Field | Value |
|-------|-------|
| **Work-item** | <work-id> |
| **Source** | <ticket / spec link> |
| **Plan version** | 1.0 |
| **Last updated** | <YYYY-MM-DD> |

## Business view
- **Business driver:** <why this work matters — business outcome>
- **Acceptance criteria:** AC1 … (mirrors work.md; source of truth)
- **Priorities:** P1 critical / P2 important / P3 nice-to-have — each with business justification
- **Out of scope:** <what is explicitly NOT covered>

## Architecture view
### Coverage overview
| Area / AC | Cases | Positive | Negative | Edge | Current | Target |
|-----------|-------|----------|----------|------|---------|--------|
| AC1 | 3 | 1 | 1 | 1 | 0% | 100% |
- **Risk areas:** <where defects are most likely or most costly>
- **Open questions (for review):** <decisions to confirm before implementation>
- **Sign-off checklist:** [ ] scope covers critical ACs · [ ] priorities reflect criticality · [ ] no critical scenario missing · [ ] out-of-scope acceptable

## Implementation view
### Test case summary
| TC | Traces to | Type | Priority | Level | Dependencies | Status |
|----|-----------|------|----------|-------|--------------|--------|
| TC1 | AC1 | Positive | P1 | API | — | planned |
### Business test cases
#### TC1: <business scenario name>
- **What it tests:** <user action / behavior exercised>
- **What it verifies:** <expected business outcome>
- **Preconditions / Input / Expected result:** <…>
- **Priority:** P1 — <why> · **Traces to:** AC1
### Reference pattern
<existing test in the repo this should mirror — path + why>
### Work division
| Workstream | Scope | TCs | Depends on |
|------------|-------|-----|------------|
| WS-1 | <area> | TC1..TCn | — |
### Dependencies & prerequisites
- **Data setup / cleanup · cross-test sequencing · environment · auth** (only what applies)
### Dependency diagram
<!-- @formatter:off -->
\`\`\`mermaid
graph LR
    TC1[TC1: setup] --> TC2[TC2: validate]
\`\`\`
<!-- @formatter:on -->

## Clarification checklist
| # | Topic | Question | Status | Answer |
|---|-------|----------|--------|--------|
| Q1 | <topic> | <question> | open / resolved | <answer> |

## Source references
| Source | Path / URL | What was extracted |
|--------|------------|--------------------|
| <doc> | <path#Lnn / url> | <takeaways> |

## Assumptions
| ID | Claim | Basis | Impact | Verification | Confidence |
|----|-------|-------|--------|--------------|------------|

## Changelog
| Date | Author | Change |
|------|--------|--------|`;

const CASES_TEMPLATE = `# Test cases: <work-id>

> Detailed, executable test-case specs derived from the plan's business test cases.
> Each case traces to an acceptance criterion and becomes one automated test
> (referenced as \`Covers: TC<n>\` in automation.md).
> Reads first: spec-driven-development, test-naming, test-data-management.

## TC1: <case title>
- **Traces to:** AC1            <!-- + parent business case from plan, if applicable -->
- **Type:** Positive | Negative | Parameterized | Edge
- **Priority:** P1 | P2 | P3
- **Test level:** unit | API | E2E
- **Preconditions:** <state / setup required>
- **Test data:** <factory / fixture name — see qa-test-data-gen>
- **Steps:**
  1. <action>
- **Expected result:** <observable, asserted outcome>
- **Variants (parameterized / boundary / invalid):**
  | Input | Expected |
  |-------|----------|
  | <valid baseline> | <pass> |
  | <boundary> | <…> |
  | <invalid> | <error / rejection> |`;

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

## Preconditions
- <state before reproduction>

## Steps to reproduce
1. <step>

## Expected vs actual
- **Expected:** <...>
- **Actual:** <...>

## Impact
<who / what is affected; blast radius>

## Observations / logs
> Factual, service-level excerpts only — no test-internal mechanics.
\`\`\`
<raw log / response payload / HTTP code>
\`\`\`

## Root cause summary
<from qa-rca; any inference marked as an Assumption (A1) per the assumptions guideline>

## Suggested fix
- <recommendation(s)>

## Regression risk
<related areas to re-test>

## Evidence
- <links to trace / screenshot / log via the result MCP server or tools.md paths>

## Open questions
- <unresolved>`;

const REFINEMENT_TEMPLATE = `---
jira_key: <KEY>
ticket_type: Bug | Story/Feature | Task/Sub-task | Maintenance | Test Case
status: Draft
date: <YYYY-MM-DD>
related_docs: []
---
# <ticket_type>: <title>

## Context
<factual, from fetched Jira / Xray / Confluence / attachments; mark gaps [Required input — not provided]>

## Goals / Non-Goals
<what this ticket will and will not achieve>

## Scope / Out of scope
<what is in; what is explicitly excluded>

## Impacted files & classes
- <File / Class> — <path#Lnn>          <!-- from codebase scan; grounding -->

## Solution options
<the viable approaches considered>

## Recommendation
1. **Conservative** — <approach> · trade-offs: <…>
2. **Extensible** — <approach> · trade-offs: <…>
3. **Performance** — <approach> · trade-offs: <…>
   <!-- optional 4. Tooling -->

## Acceptance criteria
- <criterion>

## Suggested tests
- <test levels / cases this work should be verified by>

## Risks
<what could go wrong; mitigation>

## Dependencies
<blocking tickets, services, data>

## Documentation links
- <configurable project doc-space link>

## Open questions
- [Required input — not provided] <where applicable>

## Definition of Done
- <the checklist that closes this ticket>`;

/** The runtime artifacts under `context/changes/<work-id>/`, plus standalone areas, in workflow order. */
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
    requiredSections: ["Business view", "Architecture view", "Implementation view"],
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
  {
    // R-066 — standalone deliverable: ticket refinement does not require a
    // work-id (refinement often precedes the work-item), so it lives in its own
    // `context/refinements/` area rather than under `changes/<work-id>/`.
    name: "refinement",
    pathTemplate: "context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.md",
    producedBy: "qa-ticket-review",
    requiredSections: ["Context", "Recommendation", "Acceptance criteria"],
    template: REFINEMENT_TEMPLATE,
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
