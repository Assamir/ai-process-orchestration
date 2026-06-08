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
Foundation docs have no unresolved \`{{PLACEHOLDER}}\` markers and the root config links to them.`,
  },
  {
    name: "qa-new",
    description: "Open a new QA work-item (a bounded unit of test work) with a stable id.",
    readOnly: false,
    bucket: "backbone",
    reads: ["context/foundation/test-strategy.md"],
    writes: ["context/changes/<work-id>/work.md"],
    body: `## When to use
Starting any unit of test work: a ticket to test, a regression to chase, a suite to automate.

## Procedure
1. Derive a stable \`work-id\` as \`<stream>-<slug>\` (e.g. \`api-login-429\`). Keep it deterministic so re-runs stay stable.
2. Create \`context/changes/<work-id>/work.md\` with: title, source (ticket link), goal, in/out of scope, and acceptance criteria.
3. Do not start planning yet — hand off to \`qa-plan\` (or \`ticket-review\` first if the requirement is unclear).

## Done when
\`context/changes/<work-id>/work.md\` exists and states scope + acceptance criteria.`,
  },
  {
    name: "qa-plan",
    description: "Write the test approach for a work-item before any cases or code are produced.",
    readOnly: false,
    bucket: "backbone",
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
The plan lists ordered steps, risks, and success criteria, and has been approved.`,
  },
  {
    name: "qa-implement",
    description: "Execute an approved work-item plan step by step, keeping context/ current.",
    readOnly: false,
    bucket: "backbone",
    reads: ["context/changes/<work-id>/plan.md"],
    writes: ["context/changes/<work-id>/"],
    body: `## When to use
After \`qa-plan\` is approved. Executes the plan by delegating to the design/automation/analysis skills.

## Procedure
1. Work the plan steps in order. For each step, hand off to the right skill (\`test-case-design\`, \`automation-bootstrapper\`, \`test-automate\`, \`test-data-gen\`).
2. After each step, update the work-item folder (cases.md / automation.md) so progress survives a context reset.
3. Run the relevant tests and capture results; on failure hand off to \`rca\`.
4. Stop and escalate when the plan is blocked or a decision exceeds autonomy **{{AUTONOMY_LEVEL}}**.

## Done when
Every plan step is done or explicitly deferred, with artifacts recorded under the work-item.`,
  },
  {
    name: "qa-review",
    description: "Review a finished work-item for coverage, quality, and traceability (read-only).",
    readOnly: true,
    bucket: "backbone",
    reads: ["context/changes/<work-id>/"],
    writes: [],
    body: `## When to use
Before archiving a work-item. Read-only: report findings, do not modify files.

## Procedure
1. Check every acceptance criterion in \`work.md\` traces to at least one test case in \`cases.md\`.
2. Check automated tests follow the QA conventions and the chosen framework **{{AUTOMATION_FRAMEWORK}}**.
3. Flag gaps: uncovered criteria, missing edge cases, flaky patterns, missing trace/screenshot on failure.
4. Write the review summary to the chat in **{{REPORT_LANGUAGE_NAME}}**; recommend approve / changes-needed.

## Done when
A clear verdict with a findings list is produced. No files were modified.`,
  },
  {
    name: "qa-archive",
    description: "Close a reviewed work-item: capture lessons and move it to the read-only archive.",
    readOnly: false,
    bucket: "backbone",
    reads: ["context/changes/<work-id>/"],
    writes: ["context/archive/<work-id>/", "context/foundation/lessons.md"],
    body: `## When to use
After \`qa-review\` approves a work-item.

## Procedure
1. Append any reusable lesson (a flaky area, a data trick, a tooling gotcha) to \`context/foundation/lessons.md\`.
2. Move \`context/changes/<work-id>/\` to \`context/archive/<work-id>/\` (treat as read-only history).
3. Note any follow-up test debt for \`tech-debt-tracker.md\` if present.

## Done when
The work-item lives under \`context/archive/\` and lessons are captured.`,
  },
];

const design: LogicalSkill[] = [
  {
    name: "ticket-review",
    description: "Analyze a ticket/requirement for testability, acceptance criteria, and risk (read-only).",
    readOnly: true,
    bucket: "design",
    reads: ["context/changes/<work-id>/work.md"],
    writes: [],
    body: `## When to use
When a ticket arrives and you need to know if it can be tested as written. Read-only.

## Procedure
1. Restate the requirement in one sentence; if you cannot, the ticket is ambiguous — list the questions.
2. Extract explicit and implicit acceptance criteria; mark each as testable / not-yet-testable.
3. Identify risk areas, edge cases, and required test data and environments.
4. Output (in **{{REPORT_LANGUAGE_NAME}}**): a testability verdict, the criteria list, open questions, and suggested test levels. Recommend updating \`work.md\` accordingly.

## Done when
The reviewer has a clear testability verdict and a list of open questions.`,
  },
  {
    name: "test-plan",
    description: "Create or update the project's foundation test plan (strategy-level, durable).",
    readOnly: false,
    bucket: "design",
    reads: ["context/foundation/test-strategy.md"],
    writes: ["context/foundation/test-plan.md"],
    body: `## When to use
To establish or evolve the durable, cross-work-item test plan.

## Procedure
1. Read the test strategy and any existing test plan.
2. Fill/refresh \`context/foundation/test-plan.md\`: scope, test levels and their split, entry/exit criteria, environments, tooling (**{{AUTOMATION_FRAMEWORK}}**), risk-based priorities, and reporting cadence.
3. Keep it lean and link out to foundation docs rather than duplicating them.

## Done when
\`test-plan.md\` is current and free of unresolved \`{{PLACEHOLDER}}\` markers.`,
  },
  {
    name: "test-case-design",
    description: "Generate structured test cases for a work-item from its acceptance criteria.",
    readOnly: false,
    bucket: "design",
    reads: ["context/changes/<work-id>/work.md", "context/foundation/test-plan.md"],
    writes: ["context/changes/<work-id>/cases.md"],
    body: `## When to use
After acceptance criteria are clear (post \`ticket-review\`).

## Procedure
1. For each acceptance criterion, derive positive, negative, and boundary cases. Do not stop at the happy path.
2. Write each case to \`context/changes/<work-id>/cases.md\` with: id, title, preconditions, steps, expected result, test level, and the criterion it traces to.
3. Note required test data; hand off to \`test-data-gen\` if it must be produced.
4. Keep cases automation-ready (deterministic, independent).

## Done when
Every acceptance criterion maps to one or more traceable cases.`,
  },
];

const automation: LogicalSkill[] = [
  {
    name: "automation-bootstrapper",
    description: "Set up the test-automation framework and wire result artifacts to be agent-readable.",
    readOnly: false,
    bucket: "automation",
    reads: ["context/.scaffold/manifest.json", "context/foundation/tools.md"],
    writes: ["context/foundation/tools.md"],
    body: `## When to use
First time a repo needs automation, or when adding a new test level.

## Procedure
1. Confirm the framework from the manifest: **{{AUTOMATION_FRAMEWORK}}**. Verify it is installed; if not, propose the exact install/config steps for the detected build tool.
2. Establish the test folder layout, config, and a smoke test that proves the harness runs.
3. Make results legible to the agent: ensure reports/traces/logs are written to known paths (e.g. Playwright HTML report + trace, JUnit XML). For Playwright, a read-only \`playwright-results\` MCP filesystem server is already wired in the platform's MCP config (\`.mcp.json\` / \`.vscode/mcp.json\`) over \`./playwright-report\` + \`./test-results\` — verify those paths match your Playwright config and adjust if needed. Record the result paths in \`context/foundation/tools.md\` so \`rca\` and \`test-automate\` can read outcomes directly.
4. Do not weaken the iron QA rule.

## Done when
A smoke test passes and result-artifact paths are recorded in \`tools.md\`.`,
  },
  {
    name: "test-automate",
    description: "Author and maintain automated tests in the chosen framework from designed cases.",
    readOnly: false,
    bucket: "automation",
    reads: ["context/changes/<work-id>/cases.md", "context/foundation/tools.md"],
    writes: ["context/changes/<work-id>/automation.md"],
    body: `## When to use
After cases are designed and the framework is bootstrapped.

## Procedure
1. Implement the designed cases as automated tests in **{{AUTOMATION_FRAMEWORK}}**, following the QA conventions.
2. Keep tests independent, deterministic, and parallel-safe; externalize URLs/credentials; capture trace/screenshot on failure.
3. Run the new tests; record the command and result location in \`context/changes/<work-id>/automation.md\`.
4. On failure, hand off to \`rca\` rather than blindly retrying.

## Done when
The new tests pass locally and the run is recorded in \`automation.md\`.`,
  },
];

const analysis: LogicalSkill[] = [
  {
    name: "rca",
    description: "Root-cause a failing test run or bug from artifacts, without changing code (read-only).",
    readOnly: true,
    bucket: "analysis",
    reads: ["context/foundation/tools.md", "context/changes/<work-id>/automation.md"],
    writes: [],
    body: `## When to use
A test failed or a bug was reported and you need the real cause, not a symptom. Read-only.

## Procedure
1. Gather artifacts: for Playwright, read the HTML report, traces, and screenshots through the \`playwright-results\` MCP server; otherwise use the paths in \`tools.md\` (logs, trace, JUnit XML). What is not in context does not exist — pull the evidence in.
2. Reproduce mentally from the trace; separate test defect (flaky/wrong assertion/data) from product defect.
3. State the root cause, the evidence chain, and a minimal fix or guard. Distinguish essential vs accidental complexity.
4. Output the analysis in **{{REPORT_LANGUAGE_NAME}}**; recommend the next skill (\`test-automate\` to fix a test, or a bug report for a product defect).

## Done when
A single root cause with an evidence chain and a recommended action is produced.`,
  },
  {
    name: "test-data-gen",
    description: "Produce test data for designed cases, matching schema and edge conditions.",
    readOnly: false,
    bucket: "analysis",
    reads: ["context/changes/<work-id>/cases.md", "context/foundation/environments.md"],
    writes: ["context/changes/<work-id>/"],
    body: `## When to use
When cases need specific data (valid, invalid, boundary) that does not exist yet.

## Procedure
1. From the cases and the environment notes, list the data each case needs, including invalid/boundary variants.
2. Generate data that matches the real schema and constraints; never invent shapes — verify against the API/DB contract or a typed SDK.
3. Provide it in a reusable form (fixtures/factories/seed files) and reference it from the cases and tests.
4. Note any data that must be cleaned up after a run.

## Done when
Every case has the data it needs, in a reusable, schema-valid form.`,
  },
];

/** The full MVP skill suite, in workflow order. */
export const SKILLS: LogicalSkill[] = [...backbone, ...design, ...automation, ...analysis];
