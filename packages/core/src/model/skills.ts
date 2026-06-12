/**
 * The logical QA skill suite — platform-agnostic. Each skill's *procedure* lives
 * here once; a PlatformAdapter renders it to `.claude/skills/<name>/SKILL.md`
 * (Claude) or `.github/prompts/<name>.prompt.md` (Copilot). This is where the
 * two packages' functional parity is guaranteed.
 *
 * Bodies may contain `{{PLACEHOLDER}}` markers: phase 1 fills what it knows
 * (framework, report language, autonomy); phase 2 (in-tool LLM) fills the rest.
 */
export interface LogicalSkill {
  /** kebab-case, stable. Becomes the skill / prompt file name. */
  name: string;
  /** One-line summary used in frontmatter and the orchestrator's handoff list. */
  description: string;
  /** Read-only skills get no write tools in the rendered tool allowlist. */
  readOnly: boolean;
  /** Capability bucket, for grouping in the root config. */
  bucket: "backbone" | "design" | "automation" | "analysis";
  /**
   * Suggested model tier for the skill's cognitive load — the single source of
   * truth for the skill × model matrix (see TECH.md §5). Rendered as Claude
   * `SKILL.md` `model:` frontmatter; Copilot prompts have no equivalent field,
   * so there it stays documentation-only. `opus` for heavy reasoning
   * (planning, RCA, case design), `haiku` for mechanical steps, `sonnet` otherwise.
   */
  suggestedModel: "opus" | "sonnet" | "haiku";
  /** `context/` paths the skill consumes. */
  reads: string[];
  /** `context/` paths the skill produces. */
  writes: string[];
  /** The procedure (markdown, no frontmatter). */
  body: string;
}

const backbone: LogicalSkill[] = [
  {
    name: "qa-init",
    description: "Bootstrap the context/ system of record and the lean root config for this repo.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "sonnet",
    reads: [],
    writes: ["context/foundation/test-strategy.md", "context/foundation/environments.md", "context/foundation/tools.md"],
    body: `## When to use
Run once, first thing, to turn a fresh scaffold into a usable QA orchestration.

## Procedure
1. Read \`context/.scaffold/manifest.json\` for the detected stack and phase-1 choices. It is the source of truth — do not re-scan.
2. Interview the QA owner briefly: product under test, critical user journeys, test environments and how to reach them, ticket source (e.g. Jira), and any compliance constraints.
3. Fill the \`{{PLACEHOLDER}}\` markers in \`context/foundation/test-strategy.md\`, \`environments.md\`, and \`tools.md\`. Keep each lean — record only what an agent cannot infer from the repo.
4. Confirm the iron QA rule names the chosen framework: **{{AUTOMATION_FRAMEWORK}}**.

## Done when
Foundation docs have no unresolved \`{{PLACEHOLDER}}\` markers and the root config links to them.

## Next
- \`qa-reverse-engineer\` — map an unfamiliar codebase into \`context/reference/\` before testing.
- \`qa-new\` — open the first work-item once the foundation is filled.`,
  },
  {
    name: "qa-new",
    description: "Open a new QA work-item (a bounded unit of test work) with a stable id.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "haiku",
    reads: ["context/foundation/test-strategy.md"],
    writes: ["context/changes/<work-id>/work.md"],
    body: `## When to use
Starting any unit of test work: a ticket to test, a regression to chase, a suite to automate.

## Procedure
1. Derive a stable \`work-id\` as \`<stream>-<slug>\` (e.g. \`api-login-429\`). Keep it deterministic so re-runs stay stable.
2. Create \`context/changes/<work-id>/work.md\` with: title, source (ticket link), goal, in/out of scope, and acceptance criteria.
3. Do not start planning yet — hand off to \`qa-plan\` (or \`qa-ticket-review\` first if the requirement is unclear).

## Done when
\`context/changes/<work-id>/work.md\` exists and states scope + acceptance criteria.

## Next
- \`qa-ticket-review\` — if the requirement is unclear, assess testability first.
- \`qa-plan\` — otherwise, plan the test approach.`,
  },
  {
    name: "qa-plan",
    description: "Write the test approach for a work-item before any cases or code are produced.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "opus",
    reads: ["context/changes/<work-id>/work.md", "context/foundation/test-plan.md"],
    writes: ["context/changes/<work-id>/plan.md"],
    body: `## When to use
After a work-item exists and its scope is clear. The plan is a control mechanism, not paperwork.

## Procedure
1. Read the work-item and the foundation test-plan.
2. Write \`context/changes/<work-id>/plan.md\`: test levels in play (unit/API/E2E), risk areas, data needs, environments, and the ordered steps (design → automate → run → analyze).
3. State assumptions and what is explicitly NOT covered.
4. Pause for human approval before implementing (respect autonomy level: **{{AUTONOMY_LEVEL}}**).

## Done when
The plan lists ordered steps, risks, and success criteria, and has been approved.

## Next
- \`qa-implement\` — once the plan is approved, execute it step by step.`,
  },
  {
    name: "qa-implement",
    description: "Execute an approved work-item plan step by step, keeping context/ current.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "sonnet",
    reads: ["context/changes/<work-id>/plan.md"],
    writes: ["context/changes/<work-id>/"],
    body: `## When to use
After \`qa-plan\` is approved. Executes the plan by delegating to the design/automation/analysis skills.

## Procedure
1. Work the plan steps in order. For each step, hand off to the right skill (\`qa-test-case-design\`, \`qa-automation-bootstrapper\`, \`qa-test-automate\`, \`qa-test-data-gen\`).
2. After each step, update the work-item folder (cases.md / automation.md) so progress survives a context reset.
3. Run the relevant tests and capture results; on failure hand off to \`qa-rca\`.
4. Stop and escalate when the plan is blocked or a decision exceeds autonomy **{{AUTONOMY_LEVEL}}**.

## Done when
Every plan step is done or explicitly deferred, with artifacts recorded under the work-item.

## Next
- \`qa-test-case-design\` / \`qa-automation-bootstrapper\` / \`qa-test-automate\` / \`qa-test-data-gen\` — per the plan step in hand.
- \`qa-rca\` — on a test failure, before retrying.
- \`qa-review\` — when every step is done.`,
  },
  {
    name: "qa-review",
    description: "Review a finished work-item for coverage, quality, and traceability (read-only).",
    readOnly: true,
    bucket: "backbone",
    suggestedModel: "opus",
    reads: ["context/changes/<work-id>/"],
    writes: [],
    body: `## When to use
Before archiving a work-item. Read-only: report findings, do not modify files.

## Procedure
1. Check every acceptance criterion in \`work.md\` traces to at least one test case in \`cases.md\`.
2. Check automated tests follow the QA conventions and the chosen framework **{{AUTOMATION_FRAMEWORK}}**.
3. Flag gaps: uncovered criteria, missing edge cases, flaky patterns, missing trace/screenshot on failure. Per the \`grounding\` rule, cite the file/case/run behind each finding — never claim a criterion is covered without pointing at the case and the passing test.
4. Write the review summary to the chat in **{{REPORT_LANGUAGE_NAME}}**; recommend approve / changes-needed.

## Done when
A clear verdict with a findings list is produced. No files were modified.

## Next
- \`qa-coverage-gap\` — for a focused AC ↔ case ↔ test traceability map before the verdict.
- \`qa-archive\` — if approved.
- \`qa-implement\` — if changes are needed.`,
  },
  {
    name: "qa-archive",
    description: "Close a reviewed work-item: capture lessons and move it to the read-only archive.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "haiku",
    reads: ["context/changes/<work-id>/"],
    writes: ["context/archive/<work-id>/", "context/foundation/lessons.md", "context/foundation/tech-debt-tracker.md"],
    body: `## When to use
After \`qa-review\` approves a work-item.

## Procedure
1. Append any reusable lesson (a flaky area, a data trick, a tooling gotcha) to \`context/foundation/lessons.md\`.
2. Append any test debt or known-flaky area uncovered during the work-item to \`context/foundation/tech-debt-tracker.md\` — it is a first-class, versioned backlog. Add a new entry (do not delete or rewrite past ones) linking back to this work-id, so what we owe survives.
3. Move \`context/changes/<work-id>/\` to \`context/archive/<work-id>/\` (treat as read-only history).

## Done when
The work-item lives under \`context/archive/\`, lessons are captured, and any new test debt is recorded in the tracker.

## Next
- \`qa-new\` — start the next work-item.
- \`qa-gardening\` — periodically, to sweep accumulated drift.`,
  },
];

const design: LogicalSkill[] = [
  {
    name: "qa-ticket-review",
    description: "Analyze a ticket/requirement for testability, acceptance criteria, and risk (read-only).",
    readOnly: true,
    bucket: "design",
    suggestedModel: "opus",
    reads: ["context/changes/<work-id>/work.md"],
    writes: [],
    body: `## When to use
When a ticket arrives and you need to know if it can be tested as written. Read-only.

## Procedure
1. Pull the source: if an \`atlassian\` MCP server is configured (Jira + Confluence), read the ticket and any linked Confluence specs directly through it — what's not in context doesn't exist. Otherwise work from the ticket text in \`work.md\`.
2. Restate the requirement in one sentence; if you cannot, the ticket is ambiguous — list the questions.
3. Extract explicit and implicit acceptance criteria; mark each as testable / not-yet-testable. Per the \`spec-driven-development\` guideline, these agreed criteria are the spec the downstream cases will trace to — sharpen every not-yet-testable criterion now, before any case design begins.
4. Identify risk areas, edge cases, and required test data and environments.
5. Output (in **{{REPORT_LANGUAGE_NAME}}**): a testability verdict, the criteria list, open questions, and suggested test levels. Recommend updating \`work.md\` accordingly. Per the \`grounding\` rule, ground every criterion in the ticket/spec text you cite — never infer requirements that are not written, and mark anything you inferred as an open question.

## Done when
The reviewer has a clear testability verdict and a list of open questions.

## Next
- \`qa-test-plan\` — fold the requirement into the durable test plan.
- \`qa-test-case-design\` — derive cases once the criteria are testable.`,
  },
  {
    name: "qa-test-plan",
    description: "Create or update the project's foundation test plan (strategy-level, durable).",
    readOnly: false,
    bucket: "design",
    suggestedModel: "sonnet",
    reads: ["context/foundation/test-strategy.md"],
    writes: ["context/foundation/test-plan.md"],
    body: `## When to use
To establish or evolve the durable, cross-work-item test plan.

## Procedure
1. Read the test strategy and any existing test plan.
2. Fill/refresh \`context/foundation/test-plan.md\`: scope, test levels and their split, entry/exit criteria, environments, tooling (**{{AUTOMATION_FRAMEWORK}}**), risk-based priorities, and reporting cadence.
3. Keep it lean and link out to foundation docs rather than duplicating them.

## Done when
\`test-plan.md\` is current and free of unresolved \`{{PLACEHOLDER}}\` markers.

## Next
- \`qa-test-case-design\` — derive cases from the planned scope.`,
  },
  {
    name: "qa-test-case-design",
    description: "Generate structured test cases for a work-item from its acceptance criteria.",
    readOnly: false,
    bucket: "design",
    suggestedModel: "opus",
    reads: ["context/changes/<work-id>/work.md", "context/foundation/test-plan.md"],
    writes: ["context/changes/<work-id>/cases.md"],
    body: `## When to use
After acceptance criteria are clear (post \`qa-ticket-review\`).

## Procedure
1. For each acceptance criterion, derive positive, negative, and boundary cases. Do not stop at the happy path. Per the \`spec-driven-development\` guideline, derive cases from the documented criteria in \`work.md\`, not from the current code — a case that traces to no criterion is undocumented scope. If a \`playwright-browser\` MCP server is configured, explore the live UI (navigate, snapshot, inspect) to discover states and edge cases you would otherwise miss.
2. Write each case to \`context/changes/<work-id>/cases.md\` with: id, title, preconditions, steps, expected result, test level, and the criterion it traces to.
3. Note required test data; hand off to \`qa-test-data-gen\` if it must be produced.
4. Keep cases automation-ready (deterministic, independent).

## Done when
Every acceptance criterion maps to one or more traceable cases.

## Next
- \`qa-test-data-gen\` — if cases need data that does not exist yet.
- \`qa-test-automate\` — implement the designed cases.
- \`qa-coverage-gap\` — confirm every acceptance criterion now traces to a case.`,
  },
];

const automation: LogicalSkill[] = [
  {
    name: "qa-automation-bootstrapper",
    description: "Set up the test-automation framework and wire result artifacts to be agent-readable.",
    readOnly: false,
    bucket: "automation",
    suggestedModel: "sonnet",
    reads: ["context/.scaffold/manifest.json", "context/foundation/tools.md"],
    writes: ["context/foundation/tools.md"],
    body: `## When to use
First time a repo needs automation, or when adding a new test level.

## Procedure
1. Confirm the framework from the manifest: **{{AUTOMATION_FRAMEWORK}}**. Verify it is installed; if not, propose the exact install/config steps for the detected build tool.
2. Establish the test folder layout, config, and a smoke test that proves the harness runs.
3. Make results legible to the agent: ensure reports/traces/logs are written to known paths (e.g. Playwright HTML report + trace, pytest-html + JUnit XML, Surefire XML). A read-only results MCP filesystem server is pre-wired in the platform's MCP config (\`.mcp.json\` / \`.vscode/mcp.json\`) for Playwright (\`playwright-results\` over \`./playwright-report\` + \`./test-results\`), pytest (\`pytest-results\` over \`./reports\` + \`./test-results\`), and JVM runners — RestAssured/JUnit/TestNG (\`jvm-results\` over the Surefire/Serenity report dirs) — verify those paths match your config and adjust if needed. Record the result paths in \`context/foundation/tools.md\` so \`qa-rca\` and \`qa-test-automate\` can read outcomes directly.
4. Do not weaken the iron QA rule.

## Done when
A smoke test passes and result-artifact paths are recorded in \`tools.md\`.

## Next
- \`qa-test-automate\` — author tests now that the harness runs.
- \`qa-ci-pipeline\` — wire the harness into CI so the same results are produced on every push.`,
  },
  {
    name: "qa-test-automate",
    description: "Author and maintain automated tests in the chosen framework from designed cases.",
    readOnly: false,
    bucket: "automation",
    suggestedModel: "opus",
    reads: ["context/changes/<work-id>/cases.md", "context/foundation/tools.md"],
    writes: ["context/changes/<work-id>/automation.md"],
    body: `## When to use
After cases are designed and the framework is bootstrapped.

## Procedure
1. Implement the designed cases as automated tests in **{{AUTOMATION_FRAMEWORK}}**, following the QA conventions. Per the \`spec-driven-development\` guideline, automate from the designed cases (which trace to the spec) in spec → case → test order — never write a test ahead of its recorded criterion.
2. Keep tests independent, deterministic, and parallel-safe; externalize URLs/credentials; capture trace/screenshot on failure.
3. Run the new tests; record the command and result location in \`context/changes/<work-id>/automation.md\`.
4. On failure, hand off to \`qa-rca\` rather than blindly retrying.

## Done when
The new tests pass locally and the run is recorded in \`automation.md\`.

## Next
- \`qa-rca\` — on failure, find the real cause before retrying.
- \`qa-playwright-cli\` — use the Playwright CLI to record a draft, inspect a trace, or refresh snapshots.
- \`qa-ci-pipeline\` — once tests pass locally, make them run in CI and publish results.`,
  },
  {
    name: "qa-playwright-cli",
    description: "Drive the Playwright CLI (codegen, show-report, show-trace, --ui, --update-snapshots) to support test authoring and root-cause analysis.",
    readOnly: false,
    bucket: "automation",
    suggestedModel: "sonnet",
    reads: ["context/changes/<work-id>/cases.md", "context/foundation/tools.md"],
    writes: ["context/changes/<work-id>/automation.md"],
    body: `## When to use
When the project automates with Playwright (**{{AUTOMATION_FRAMEWORK}}**) and you want the CLI to do the heavy lifting: scaffold a test by recording, inspect a failed run, or refresh snapshots. Supports \`qa-test-automate\` (authoring) and \`qa-rca\` (diagnosis). For non-Playwright stacks, use that framework's own tooling instead — this skill is Playwright-specific.

## Procedure
1. **Author by recording** — \`npx playwright codegen <url>\` generates a first-pass test from real interactions. Always refactor it to the project conventions (stable locators, fixtures, the factories from \`qa-test-data-gen\`); never ship raw codegen output.
2. **Inspect a failure** — \`npx playwright show-report\` and \`npx playwright show-trace <trace.zip>\` (paths from \`context/foundation/tools.md\` or the \`playwright-results\` MCP server). Use the trace's DOM/console/network to find the real cause, then hand it to \`qa-rca\`.
3. **Debug interactively** — \`npx playwright test --ui\` (or \`--debug\`) to step a flaky/failing test. If a \`playwright-browser\` MCP server is configured, prefer it for free-form exploration.
4. **Snapshots** — refresh only when the change is intended and reviewed: \`npx playwright test --update-snapshots\`. Treat snapshot churn as a finding to explain, not a rubber-stamp.
5. Record the commands you ran and what they produced in \`context/changes/<work-id>/automation.md\` so the run is reproducible. Respect autonomy **{{AUTONOMY_LEVEL}}** before changing committed files (generated tests, snapshots).

## Done when
The CLI task is complete (a recorded test refactored to conventions, a trace inspected, or snapshots intentionally refreshed) and the commands + outcomes are noted in \`automation.md\`.

## Next
- \`qa-test-automate\` — fold the recorded/refactored test into the suite under the QA conventions.
- \`qa-rca\` — when a trace points to a product defect, root-cause it.`,
  },
  {
    name: "qa-ci-pipeline",
    description: "Generate or audit a CI pipeline that runs the chosen framework and publishes results into the report dirs wired into the result MCP.",
    readOnly: false,
    bucket: "automation",
    suggestedModel: "sonnet",
    reads: ["context/.scaffold/manifest.json", "context/foundation/tools.md"],
    writes: ["context/foundation/tools.md", ".github/workflows/qa.yml (or .gitlab-ci.yml / azure-pipelines.yml)"],
    body: `## When to use
When the suite must run in CI, not just locally — to scaffold a pipeline for a fresh repo, or to audit an existing one. The goal is to close the **test → report → legibility** loop at the CI boundary: CI runs **{{AUTOMATION_FRAMEWORK}}** and publishes its results into the exact report dirs the result MCP server already reads, so \`qa-rca\` / \`qa-metrics\` can read CI outcomes the same way they read local runs.

## Procedure
1. Read \`context/foundation/tools.md\` (run command, report / trace / results paths) and \`context/.scaffold/manifest.json\` (language, build tool, framework). These paths are the contract — the pipeline must publish into them unchanged.
2. Pick the provider. Detect what the repo already uses: **GitHub Actions** (\`.github/workflows/*.yml\`), **GitLab CI** (\`.gitlab-ci.yml\`), or **Azure Pipelines** (\`azure-pipelines.yml\`). If none exists, default to GitHub Actions and confirm before writing (respect autonomy **{{AUTONOMY_LEVEL}}**).
3. Generate (or audit) the pipeline so it: checks out, sets up the runtime + build tool, installs deps (and Playwright browsers / JVM deps as needed), runs the recorded run command for **{{AUTOMATION_FRAMEWORK}}**, and **uploads the result dirs as build artifacts** — the same dirs wired into the result MCP: \`./playwright-report\` + \`./test-results\` (Playwright), \`./reports\` + \`./test-results\` (pytest), Surefire/Serenity (\`./target/surefire-reports\` or Gradle \`./build/reports/tests\`), and \`./allure-results\` + \`./allure-report\` when Allure is used. Match the paths in \`tools.md\` exactly — a pipeline that writes results elsewhere breaks legibility.
4. Cache deps/browsers, use a matrix only where it earns its keep, and **fail the build when tests fail** — the iron QA rule holds in CI: work without passing tests is not done. Never add a step that swallows a non-zero test exit.
5. In **audit** mode, do not rewrite blindly: check the existing pipeline actually runs the framework, fails on test failure, and uploads every result dir; report each gap with the single fix.
6. Record the pipeline file path and how to fetch its artifacts in \`context/foundation/tools.md\` so the result MCP and \`qa-metrics\` know where CI results land.

## Done when
A CI pipeline for the detected provider runs **{{AUTOMATION_FRAMEWORK}}**, fails on test failure, and publishes the result dirs the result MCP reads — and \`tools.md\` records it. In audit mode, a gap report with one fix per finding (output in **{{REPORT_LANGUAGE_NAME}}**).

## Next
- \`qa-metrics\` — aggregate the now-published CI results into the QA health digest.
- \`qa-rca\` — when a CI run fails, root-cause it from the uploaded artifacts.`,
  },
];

const analysis: LogicalSkill[] = [
  {
    name: "qa-rca",
    description: "Root-cause a failing test run or bug from artifacts, without changing code (read-only).",
    readOnly: true,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: ["context/foundation/tools.md", "context/changes/<work-id>/automation.md"],
    writes: [],
    body: `## When to use
A test failed or a bug was reported and you need the real cause, not a symptom. Read-only.

## Procedure
1. Gather artifacts: for Playwright, read the HTML report, traces, and screenshots through the \`playwright-results\` MCP server; otherwise use the paths in \`tools.md\` (logs, trace, JUnit XML). What is not in context does not exist — pull the evidence in.
2. Reproduce mentally from the trace; separate test defect (flaky/wrong assertion/data) from product defect. If a \`playwright-browser\` MCP server is configured, re-drive the failing path interactively to confirm the reproduction rather than guessing.
3. State the root cause, the evidence chain, and a minimal fix or guard. Distinguish essential vs accidental complexity. Per the \`grounding\` rule, every link in the chain cites a real artifact (\`file:line\`, trace, result-MCP output); if the evidence is inconclusive, say so rather than asserting a cause you cannot trace.
4. Output the analysis in **{{REPORT_LANGUAGE_NAME}}**; recommend the next skill (\`qa-test-automate\` to fix a test, or a bug report for a product defect).

## Done when
A single root cause with an evidence chain and a recommended action is produced.

## Next
- \`qa-test-automate\` — if it is a test defect, fix the test.
- \`qa-bug-report\` — if it is a product defect, file a structured report.`,
  },
  {
    name: "qa-test-data-gen",
    description: "Produce test data for designed cases, matching schema and edge conditions.",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "sonnet",
    reads: ["context/changes/<work-id>/cases.md", "context/foundation/environments.md"],
    writes: ["context/changes/<work-id>/"],
    body: `## When to use
When cases need specific data (valid, invalid, boundary) that does not exist yet — especially when more than one case needs the same shape with small variations. Prefer building this once, not inline per test.

## Procedure
1. From the cases and the environment notes, list the data each case needs, including invalid/boundary variants. Group cases that share a shape — they should share one factory, not copy-pasted literals.
2. Build **reusable factories/builders, not inline values.** A factory exposes schema-valid defaults and lets each case override only the field under test, so a boundary/invalid case overrides one field and inherits a valid rest. Use the idiom for **{{AUTOMATION_FRAMEWORK}}**:
   - Playwright (TypeScript/JS): \`@faker-js/faker\` + builder functions or Playwright \`fixtures\`.
   - pytest: \`faker\` + \`factory_boy\` model factories exposed as pytest \`fixtures\`.
   - RestAssured/JUnit/TestNG (JVM): \`datafaker\`/\`instancio\` + builder or object-mother factories.
   If no data library is available, fall back to plain typed builder functions — the pattern (named, overridable, schema-valid defaults) matters more than the tool. Mock external dependencies at the seam, not the data.
3. Validate generated shapes against the real contract — a typed SDK, JSON Schema/OpenAPI, or the DB model. Never invent shapes; a factory that drifts from the schema is worse than none.
4. Reference each factory/fixture **by name from the case in \`cases.md\`** (and import it from the test) so data use is traceable to the criterion. Note any data that must be cleaned up after a run.

## Done when
Every case is backed by a named, reusable, schema-valid factory/fixture (not inline literals), referenced from \`cases.md\`, with boundary/invalid variants expressed as overrides.

## Next
- \`qa-test-automate\` — wire the generated factories/fixtures into the tests.
- \`qa-coverage-gap\` — confirm each case (and its data) still traces to a criterion.`,
  },
  {
    name: "qa-gardening",
    description: "Recurring read-only, LLM-driven sweep for semantic QA drift/slop across context/ and tests; proposes and delegates targeted fixes, never edits — the in-agent-loop complement to the deterministic doctor command.",
    readOnly: true,
    bucket: "analysis",
    suggestedModel: "sonnet",
    reads: ["context/foundation/", "context/changes/", "context/archive/"],
    writes: [],
    body: `## When to use
Run on a cadence (end of a sprint, before a release) to fight entropy: stale context, drifted docs, dead test debt, accumulated "QA slop". Read-only — it reports a fix list, it never edits.

**\`qa-gardening\` vs \`doctor\`.** \`doctor\` is deterministic and mechanical, run *outside* the agent loop (structure, broken links, leftover placeholders, the iron-rule presence — exit code for CI). \`qa-gardening\` is the *semantic* pass *inside* the agent loop: it folds in \`doctor\`'s findings (never re-deriving them), then judges drift a validator cannot see (contradictions, stale info, untraced coverage) and hands each fix to the right write skill. It diagnoses and dispatches; it never applies the fix itself.

## Procedure
1. Start from deterministic signals: run \`doctor\` (or read its latest report) and fold its findings in — broken links, leftover \`{{PLACEHOLDER}}\` markers, missing files. What \`doctor\` already catches, you do not re-derive.
2. Scan the system of record for drift and staleness:
   - Foundation docs (\`test-strategy\`, \`test-plan\`, \`environments\`, \`tools\`, \`lessons\`, \`tech-debt-tracker\`) — contradictions, out-of-date info, paths that no longer exist, and debt entries that were resolved but never linked to the work-item that paid them down.
   - \`context/changes/\` — work-items that are done but never archived, or abandoned and stale.
   - Tests vs cases — cases with no automated test, tests with no traced criterion, duplicated/overlapping coverage, and flaky patterns recorded in \`lessons.md\`.
3. Apply the golden rules and flag each violation: every behavior has a test in **{{AUTOMATION_FRAMEWORK}}**; every case traces to an acceptance criterion; \`context/\` stays lean and current. This sweep reinforces the iron QA rule — never propose weakening it.
4. Output a prioritized fix list in **{{REPORT_LANGUAGE_NAME}}**: each item states what is wrong, where (file/path), why it matters, and the single targeted fix. Group by severity and hand each fix to the right write skill (\`qa-archive\`, \`qa-test-automate\`, \`qa-test-case-design\`, \`qa-test-plan\`). Do not edit files yourself.

## Done when
A prioritized, deduplicated drift report exists with a concrete next action per item. No files were modified.

## Next
- \`qa-archive\` / \`qa-test-automate\` / \`qa-test-case-design\` / \`qa-test-plan\` — hand each proposed fix to the matching write skill.`,
  },
  {
    name: "qa-coverage-gap",
    description: "Map acceptance criteria → test cases → automated tests and report uncovered criteria (read-only).",
    readOnly: true,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: [
      "context/changes/<work-id>/work.md",
      "context/changes/<work-id>/cases.md",
      "context/changes/<work-id>/automation.md",
      "context/foundation/test-plan.md",
    ],
    writes: [],
    body: `## When to use
When you need to know what is *not* covered: which acceptance criteria have no case, which cases have no automated test, and which tests trace to no criterion. Read-only — it produces a traceability map and a gap report, it never edits.

Scope it to a single work-item (the default) or, given a list of work-ids, across them. This is the focused, mechanical traceability pass; \`qa-review\` makes the broader quality judgment and \`qa-gardening\` sweeps drift — this one only answers "what is covered, and what is missing".

## Procedure
1. Read the acceptance criteria from \`context/changes/<work-id>/work.md\` (and the planned scope in \`context/foundation/test-plan.md\` for cross-work-item coverage). Each criterion is a node to cover.
2. Read \`context/changes/<work-id>/cases.md\`: for each case, follow the criterion it traces to. A case that traces to no criterion, or a criterion with no case, is a gap.
3. Read \`context/changes/<work-id>/automation.md\` and reconcile cases against the automated tests in **{{AUTOMATION_FRAMEWORK}}**: a designed case with no automated test, or a test traceable to no case/criterion, is a gap. Pull the real test outcomes through the result MCP server (\`playwright-results\` / \`pytest-results\` / \`jvm-results\`) where available — a case "covered" by a skipped or perpetually-failing test is not truly covered; flag it.
4. Build the **AC ↔ case ↔ test** traceability table and classify each criterion: *covered* (case + passing test), *partial* (case but no/failing test), or *uncovered* (no case). Note orphans (cases/tests tracing to nothing).
5. Output a coverage-gap report in **{{REPORT_LANGUAGE_NAME}}**: the traceability table, a coverage count (covered / partial / uncovered), and a prioritized list of the gaps with the single next action for each. Reinforce the iron QA rule — never propose weakening it. Per the \`grounding\` rule, every "covered" cell cites the real case/test it traces to (and the run that proves it passed) — when in doubt, classify it *partial* or *uncovered* rather than assuming coverage.

## Done when
A coverage-gap report exists with an AC ↔ case ↔ test traceability table, a covered/partial/uncovered tally, and a prioritized gap list. No files were modified.

## Next
- \`qa-test-case-design\` — design cases for the *uncovered* criteria.
- \`qa-test-automate\` — automate the *partial* criteria (case exists, no passing test).
- \`qa-review\` — fold the coverage verdict into the work-item review before archiving.`,
  },
  {
    name: "qa-metrics",
    description: "Aggregate pass/fail/flakiness and acceptance-criterion coverage from the result MCP servers and context/ into a read-only QA metrics digest.",
    readOnly: true,
    bucket: "analysis",
    suggestedModel: "sonnet",
    reads: [
      "context/changes/",
      "context/archive/",
      "context/foundation/tech-debt-tracker.md",
      "context/foundation/lessons.md",
    ],
    writes: [],
    body: `## When to use
On a cadence (sprint end, before a release, after a CI run) to see QA health at a glance: how many tests pass, what is flaky, and how much of the acceptance criteria is actually covered. Read-only — it emits a digest, it never edits.

This is the **observability dashboard** over the suite: \`qa-coverage-gap\` answers "what is covered for *this* work-item"; \`qa-metrics\` rolls coverage + run health up *across* work-items and *across runs*.

## Procedure
1. Pull outcomes through the result MCP server (\`playwright-results\` / \`pytest-results\` / \`jvm-results\`): the JUnit XML / JSON results and, where present, the **Allure** results/report. Allure keeps durable cross-run history (\`allure-report/history\`), so prefer it for **flakiness and trend** rather than the single latest run — result legibility here is not limited to one static report dir. What is not in context does not exist; read the artifacts in.
2. Compute run metrics: total / passed / failed / skipped, pass rate, and the **flaky** set (tests that both pass and fail across runs or retries). Note the trend vs the previous run when history is available.
3. Compute **criterion coverage** across \`context/changes/\` (and \`context/archive/\` for the baseline): how many acceptance criteria trace to a case and to a passing automated test — reuse the AC ↔ case ↔ test traceability from \`qa-coverage-gap\`. Fold in open items from \`tech-debt-tracker.md\` and known-flaky areas from \`lessons.md\`.
4. Emit a digest in **{{REPORT_LANGUAGE_NAME}}**: a metrics table (pass rate, flake count, coverage %), the top flaky tests, the biggest coverage gaps, and the trend direction. Keep it a dashboard, not prose. Reinforce the iron QA rule — never propose weakening it. Per the \`grounding\` rule, every number comes from a real result artifact you read — never estimate a pass rate or coverage %; if a source is missing, report the metric as unknown rather than guessing.

## Done when
A read-only metrics digest exists with pass/fail/flake counts, criterion-coverage %, the flaky-test list, and (when history is available) a trend. No files were modified.

## Next
- \`qa-coverage-gap\` — drill into the uncovered criteria behind the coverage number.
- \`qa-rca\` — root-cause the top flaky/failing tests.
- \`qa-gardening\` — fold the metrics into the next drift sweep.`,
  },
  {
    name: "qa-bug-report",
    description: "Turn a confirmed product defect into a structured, reproducible bug report with evidence (writes the report only).",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "sonnet",
    reads: ["context/changes/<work-id>/automation.md", "context/changes/<work-id>/work.md", "context/foundation/tools.md"],
    writes: ["context/changes/<work-id>/bug-report.md"],
    body: `## When to use
After \`qa-rca\` concludes the failure is a product defect (not a test defect) and you need a structured, reproducible report. Reads evidence; writes only the report.

## Procedure
1. Pull the evidence through the result MCP server (\`playwright-results\` / \`pytest-results\` / \`jvm-results\`) or the paths in \`context/foundation/tools.md\` (trace, screenshot, JUnit XML, logs). What is not in context does not exist; per the \`grounding\` rule, every field below cites real evidence — never invent steps, an environment, or a result you did not observe.
2. Confirm reproducibility: minimal, ordered steps from a known state; note environment and the test data used.
3. Fill the template below into \`context/changes/<work-id>/bug-report.md\`. Link the affected acceptance criterion and the work-id; carry the suspected area from \`qa-rca\`.
4. If an \`atlassian\` MCP server is configured, propose filing it as a Jira issue — mirror the template, do not invent fields.

## Template
\`\`\`md
# Bug: <one-line summary>
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
- <links to trace / screenshot / log via the result MCP server or tools.md paths>
\`\`\`

## Done when
\`bug-report.md\` exists with reproducible steps, expected vs actual, severity, evidence links, and a traced acceptance criterion. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-archive\` — once the defect is logged and the work-item is wrapping up.
- File it in \`atlassian\` (if configured) so the defect leaves the repo for the tracker.`,
  },
  {
    name: "qa-reverse-engineer",
    description: "Reverse-engineer the application source into structured project documentation under context/reference/ (read-only on code).",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: ["context/.scaffold/manifest.json"],
    writes: ["context/reference/"],
    body: `## When to use
To understand an existing application before planning tests, or to onboard onto an unfamiliar/legacy codebase. Read-only on the application source — it never modifies code; it only reads it and writes documentation under \`context/reference/\`.

## Procedure
1. Recon first: from \`context/.scaffold/manifest.json\` and a light scan, identify the language(s), build tool, frameworks, and the obvious entry points (HTTP routes, CLI, jobs, message consumers).
2. **Propose the documentation structure before writing.** For a large or monolithic codebase, propose how to split it (by module / domain / bounded context / C4 container) and pause for approval (respect autonomy **{{AUTONOMY_LEVEL}}**) — do not dump one giant file.
3. Document the architecture with the **C4 model** (see the \`diagram-conventions\` guideline), top-down: L1 system context in \`c4-context.md\`, L2 containers in \`c4-container.md\`, L3 components (for the testing-critical containers) in \`c4-component.md\`. Skip L4 (code) unless a specific component needs it — link to source instead. Index everything from \`system-overview.md\` and fill its business-context + test-surface (risky / untested) sections.
4. Each C4 level carries one Mermaid diagram (\`C4Context\` / \`C4Container\` / \`C4Component\`, or the \`flowchart\` fallback) plus supporting prose. Zoom in only as far as the testing question needs — most QA work lives at L1–L3.
5. Link to real paths in the repo; never paste large code — reference it. Keep each doc lean and verifiable. Per the \`grounding\` rule, confirm every path / symbol / integration by opening it before documenting it — never invent an architecture; mark anything you could not verify as an assumption.

## Done when
\`context/reference/\` holds the agreed C4-structured docs (L1–L3 as needed) with no unresolved \`{{PLACEHOLDER}}\` markers, indexed from \`system-overview.md\` and tracing to real source paths. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-ticket-review\` / \`qa-test-plan\` — now informed by the system map.
- \`qa-gardening\` — can read \`context/reference/\` to flag drift between the map and the code.`,
  },
];

/**
 * R-033 — standing "read related guidelines before acting" step. Injected at the
 * top of every **write** skill's procedure so the rule lives once here and stays
 * in lock-step across the suite (read-only skills don't change files, so they are
 * left untouched). Mirrors the "Read before you write" rule in the lean root map.
 */
const READ_FIRST_STEP =
  "> **Read first (standing rule):** before changing anything, read the guidelines/standards related to this task — at minimum `qa-conventions` and `test-naming`, plus any that apply (`spec-driven-development`, `grounding`, `documentation-as-code`, `diagram-conventions`). See \"Read before you write\" in the root map.";

/** The full MVP skill suite, in workflow order. */
export const SKILLS: LogicalSkill[] = [...backbone, ...design, ...automation, ...analysis].map((s) =>
  s.readOnly
    ? s
    : { ...s, body: s.body.replace("## Procedure\n", `## Procedure\n${READ_FIRST_STEP}\n\n`) },
);
