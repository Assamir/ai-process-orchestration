/**
 * The logical QA skill suite — platform-agnostic. Each skill's *procedure* lives
 * here once; a PlatformAdapter renders it to `.claude/skills/<name>/SKILL.md`
 * (Claude) or `.github/prompts/<name>.prompt.md` (Copilot). This is where the
 * two packages' functional parity is guaranteed.
 *
 * Bodies may contain `{{PLACEHOLDER}}` markers: phase 1 fills what it knows
 * (framework, report language, autonomy); phase 2 (in-tool LLM) fills the rest.
 *
 * The shape of the runtime artifacts a skill writes lives once in the artifact
 * template registry (`model/artifacts.ts`); the producing skills embed it via
 * `tpl(name)` inside a fenced `## Template` section (R-059).
 */
import { tpl } from "./artifacts.js";
import { JIRA_CONVERSION_TABLE } from "./jira.js";

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
- \`qa-guidelines\` — fill the guideline files' \`{{PLACEHOLDER}}\` slots with project-specific rules and ✅/❌ examples before any QA work.
- \`qa-reverse-engineer\` — map an unfamiliar codebase into \`context/reference/\` before testing.
- \`qa-new\` — open the first work-item once the foundation and guidelines are filled.`,
  },
  {
    name: "qa-guidelines",
    description: "Fill the scaffolded guideline files' phase-2 placeholders with project-specific rules and ✅/❌ examples grounded in the codebase.",
    readOnly: false,
    bucket: "backbone",
    suggestedModel: "sonnet",
    reads: ["context/.scaffold/manifest.json", "context/foundation/test-strategy.md", "context/foundation/tools.md"],
    writes: ["the project guideline files (.github/instructions/ or .ai/guidelines/)"],
    body: `## When to use
Right after \`qa-init\`, before real QA work begins — and again whenever a guideline is added (a new standard) or the stack changes. Phase 1 seeds every guideline with \`{{PLACEHOLDER}}\` slots; this skill fills them with rules and examples real to *this* codebase, so the standards the write skills read before acting are project-true, not generic.

## Procedure
1. Read \`context/.scaffold/manifest.json\` for the detected stack and phase-1 choices, and skim the filled foundation docs (\`test-strategy.md\`, \`tools.md\`) — they are the source of truth; do not re-scan blindly.
2. List every guideline file (\`.github/instructions/*.instructions.md\` on Copilot, \`.ai/guidelines/*.md\` on Claude) that still contains a \`{{...}}\` marker. Those markers are your worklist; \`doctor\`'s \`GUIDELINE:unfilled\` findings name the same files.
3. Fill each marker with **project-specific** content:
   - Keep it lean — record only non-obvious rules an agent would otherwise get wrong; skip anything inferable from the repo.
   - In each \`## Examples (✅ good / ❌ bad)\` section, replace any placeholder with **short examples taken from real code in this repo**, each cited at \`file:line\` — never generic snippets (the \`grounding\` rule).
   - In the \`## Applicable patterns\` / \`*_PATTERNS\` and \`*_WORKFLOW\` slots, name the concrete patterns and workflow this codebase actually uses (e.g. Page Object, Arrange-Act-Assert, Builder for test data).
   - Order: \`qa-conventions\` first, then \`test-naming\` and \`spec-driven-development\`, then the rest.
4. **Never invent.** Per the \`grounding\` rule, if you cannot ground a rule or example in the code, do not fill it with a guess: leave a \`> TODO (needs human input): …\` line in place of the marker and list every such gap back to the QA owner at the end. Per the \`assumptions\` guideline, any unavoidable inference is legalized in a \`## Assumptions\` table, never stated as fact.
5. Preserve each file's frontmatter, headings, and the load-bearing contract sentences \`doctor\` checks (e.g. the docs-as-code \`doctor\`/CI line, the grounding cite/uncertainty line, the environment-management secrets/env-var line) — only fill the placeholder bodies, never weaken a stated contract.

## Done when
No guideline file has an unresolved \`{{PLACEHOLDER}}\` marker (only marked \`> TODO (needs human input)\` lines for genuine gaps), every \`## Examples\` section shows a ✅/❌ pair real to this repo, and \`doctor\` reports no \`GUIDELINE:unfilled\` findings. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-reverse-engineer\` — map an unfamiliar codebase into \`context/reference/\` before testing.
- \`qa-new\` — open the first work-item once the foundation and guidelines are filled.`,
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
2. Create \`context/changes/<work-id>/work.md\` from the **Template** below — set frontmatter \`status: in-progress\` and give every acceptance criterion a stable \`AC<n>\` id (\`AC1\`, \`AC2\`, …) so downstream cases can trace to it.
3. Do not start planning yet — hand off to \`qa-plan\` (or \`qa-ticket-review\` first if the requirement is unclear).

## Template
\`\`\`md
${tpl("work")}
\`\`\`

## Done when
\`context/changes/<work-id>/work.md\` exists, states scope, and gives every acceptance criterion a stable \`AC<n>\` id.

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
After a work-item exists and its scope is clear. The plan is a living control mechanism, not paperwork — it is updated in place as the work-item progresses.

## Procedure
1. Read the work-item (\`work.md\`, with its \`AC<n>\` ids) and the foundation test-plan/strategy.
2. Write \`context/changes/<work-id>/plan.md\` from the **Template** below, organized into three perspectives:
   - **Business view** — the business driver, the acceptance criteria mirrored from \`work.md\`, P1–P3 priorities each with a business justification, and what is out of scope.
   - **Architecture view** — a coverage overview (area/AC × positive/negative/edge × current/target), risk areas, open questions for review, and a sign-off checklist.
   - **Implementation view** — the test-case summary table (TC | Traces to | Type | Priority | Level | Dependencies | Status), the **business-level** test cases (the detailed/automatable cases live in \`cases.md\`), a reference pattern, work division, dependencies & prerequisites, and a Mermaid dependency diagram (per \`diagram-conventions\`, wrapped in \`@formatter:off\`/\`@formatter:on\`).
3. Fill the clarification checklist, source references (grounding — cite each \`file:line\`/ticket the plan derives from), assumptions, and changelog. Per the \`spec-driven-development\` guideline every business test case carries \`Traces to: AC<n>\`. Per the \`documentation\` standard, record the pillar docs this plan rests on in the \`built-on:\` frontmatter — the **P1** application reference (\`context/reference/\`) and the **P2** domain knowledge (\`context/knowledge/\`) it derives from; the validator link-checks them.
4. Pause for human approval before implementing (respect autonomy level: **{{AUTONOMY_LEVEL}}**).

## Template
\`\`\`md
${tpl("plan")}
\`\`\`

## Done when
The plan covers the Business / Architecture / Implementation perspectives, every business test case traces to an acceptance criterion, and it has been approved.

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
    description: "Refine a ticket/requirement into a dual-output deliverable (canonical Markdown + paste-ready Jira) with testability, recommendations, and acceptance criteria.",
    readOnly: false,
    bucket: "design",
    suggestedModel: "opus",
    reads: ["context/foundation/test-strategy.md", "context/reference/system-overview.md"],
    writes: [
      "context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.md",
      "context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.jira",
    ],
    body: `## When to use
When a ticket arrives and you need a refined, testable deliverable — testability verdict, solution recommendations, and sharp acceptance criteria. Standalone: a refinement often **precedes** the work-item, so it does not require a \`<work-id>\`. Writes the canonical Markdown and a paste-ready Jira version under \`context/refinements/\`.

## Procedure
1. **Fetch the source through MCP — never summarize from the title.** Per the \`mcp-content-fetch\` guideline, follow the download -> verify -> convert -> read ordering: \`getIssue\` (Jira) -> the \`xray\` server for a Test / Test Execution / Test Plan / Test Set issue -> linked Confluence (\`getPage\` / \`searchConfluence\`) -> attachments (\`getAttachments\` / \`getAttachmentContent\`), staged under \`context/refinements/.attachments/<source-id>/\` and converted with \`markitdown\` on the local path. Source priority: Jira+Xray > Jira > Confluence > attachments. What's not fetched doesn't exist.
2. **Classify the ticket** into one of the five merged types — Bug, Story/Feature, Task/Sub-task, Maintenance, Test Case — and restate the requirement in one sentence; if you cannot, it is ambiguous, so list the questions.
3. **Scan the codebase for impact** (grounding): name the impacted files/classes at \`file:line\`. Extract explicit and implicit acceptance criteria; per the \`spec-driven-development\` guideline these agreed criteria are the spec downstream cases will trace to — sharpen every not-yet-testable one now.
4. **Recommend at least 3 options** — Conservative / Extensible / Performance (+ optional Tooling), each with its trade-offs. Identify risks, dependencies, suggested tests, and a Definition of Done.
5. **Write the canonical Markdown** to \`context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.md\` from the **Template** below, then **project it to the \`.jira\` twin** (100% Jira wiki markup) via the **Markdown->Jira** conversion: a Jira-field header (Issue Type, Summary with the *configurable* prefix, Priority, Component/s, Labels with the *configurable* required-label, Attachment note, Linked Issues) plus the per-type body (Bug / Story-Feature / Task-Sub-task / Maintenance / Test Case). A Sub-task takes no prefix and inherits priority/component/labels/Linked-Issues from its parent. Preserve \`{code}/{panel}/{info}/{warning}/{noformat}\` macros.
6. **Zero assumptions.** Per the \`grounding\` and \`assumptions\` guidelines: ground every claim in fetched/cited evidence; write \`[Required input — not provided]\` for a gap (never invent a basis); flag conflicting sources explicitly; any unavoidable inference goes in a \`## Assumptions\` table referenced inline as \`(A1)\`. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Template
\`\`\`md
${tpl("refinement")}
\`\`\`

## Markdown->Jira conversion
${JIRA_CONVERSION_TABLE}

## Done when
A \`context/refinements/<YYYY-MM-DD>-<KEY>-<slug>.md\` exists with Context, at least 3 Recommendations, and sharp Acceptance criteria, and its \`.jira\` twin carries the same content as Jira wiki markup with the per-type body. No invented facts — gaps are marked \`[Required input — not provided]\`.

## Next
- \`qa-new\` — open the work-item once the refinement is agreed.
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
    reads: ["context/changes/<work-id>/work.md", "context/changes/<work-id>/plan.md", "context/foundation/test-plan.md"],
    writes: ["context/changes/<work-id>/cases.md"],
    body: `## When to use
After acceptance criteria are clear (post \`qa-ticket-review\`).

## Procedure
1. Start from the plan's **business test cases** (\`plan.md\`, Implementation view) and the acceptance criteria in \`work.md\`. \`cases.md\` is the detailed, executable layer: each business case expands into one or more concrete cases that each become a single automated test. Per the \`spec-driven-development\` guideline, derive cases from the documented criteria, not from the current code — a case that traces to no criterion is undocumented scope. If a \`playwright-browser\` MCP server is configured, explore the live UI (navigate, snapshot, inspect) to discover states and edge cases you would otherwise miss.
2. For each acceptance criterion derive positive, negative, parameterized, and boundary/edge cases — do not stop at the happy path. Write each to \`context/changes/<work-id>/cases.md\` using the **Template** below: a stable \`TC<n>\` id, a \`Traces to:\` field naming the \`AC<n>\` id(s) it covers (+ the parent business-TC where applicable), Type / Priority / Test level, Preconditions, the named **Test data** factory/fixture, Steps, the asserted Expected result, and a **Variants** table for parameterized/boundary/invalid inputs. Per the \`documentation\` standard, record the pillar docs the cases rest on in the \`built-on:\` frontmatter (the **P1** application reference and **P2** domain knowledge); the validator link-checks them.
3. Note required test data and name the factory/fixture for each case; hand off to \`qa-test-data-gen\` if it must be produced. Per the \`test-data-management\` guideline, the Variants table is where boundary/invalid inputs live as overrides of a valid baseline.
4. Keep cases automation-ready (deterministic, independent) — one behavior per case.

## Template
\`\`\`md
${tpl("cases")}
\`\`\`

## Done when
Every acceptance criterion maps to one or more cases, and every case carries a \`Traces to:\` field.

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
    reads: ["context/.scaffold/manifest.json", "context/foundation/tools.md", "context/foundation/test-framework.md"],
    writes: ["context/foundation/tools.md", "context/foundation/test-framework.md"],
    body: `## When to use
First time a repo needs automation, or when adding a new test level.

## Procedure
1. Confirm the framework from the manifest: **{{AUTOMATION_FRAMEWORK}}**. Verify it is installed; if not, propose the exact install/config steps for the detected build tool.
2. Establish the test folder layout, config, and a smoke test that proves the harness runs.
3. Make results legible to the agent: ensure reports/traces/logs are written to known paths (e.g. Playwright HTML report + trace, pytest-html + JUnit XML, Surefire XML). A read-only results MCP filesystem server is pre-wired in the platform's MCP config (\`.mcp.json\` / \`.vscode/mcp.json\`) for Playwright (\`playwright-results\` over \`./playwright-report\` + \`./test-results\`), pytest (\`pytest-results\` over \`./reports\` + \`./test-results\`), and JVM runners — RestAssured/JUnit/TestNG (\`jvm-results\` over the Surefire/Serenity report dirs) — verify those paths match your config and adjust if needed. Record the result paths in \`context/foundation/tools.md\` (the narrow, machine-read result-legibility doc) so \`qa-rca\` and \`qa-test-automate\` can read outcomes directly.
4. **Write the durable onboarding guide \`context/foundation/test-framework.md\`** — the rich "how the framework is organized and how to work in it" doc: the Stack (framework/build/language + key libraries), the project test layout (cross-linking \`repo-map.md\`), the **How to run** command matrix (all / single / tagged / headed-debug / update-snapshots), the conventions (base class/fixtures, page-objects/request-builders, tags, naming → \`test-naming\`), authentication & environment setup (→ \`environments.md\`, \`environment-management\`), how to add a new test, reference example tests, and the CI pointer (→ \`qa-ci-pipeline\`). Keep \`tools.md\` lean — it holds result paths only; don't duplicate the run matrix there.
5. Do not weaken the iron QA rule.

## Done when
A smoke test passes, result-artifact paths are recorded in \`tools.md\`, and \`test-framework.md\` documents the stack, the How-to-run matrix, and the conventions.

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
    reads: [
      "context/changes/<work-id>/cases.md",
      "context/foundation/tools.md",
      "context/foundation/framework-architecture.md",
    ],
    writes: ["context/changes/<work-id>/automation.md"],
    body: `## When to use
After cases are designed and the framework is bootstrapped.

## Procedure
1. Implement the designed cases as automated tests in **{{AUTOMATION_FRAMEWORK}}**, following the QA conventions **and the documented framework architecture** — read \`context/foundation/framework-architecture.md\` (pillar **P3**, from \`qa-framework-analyze\`) so the code reuses the documented base classes, fixtures, and page-objects/clients rather than reinventing them. Per the \`spec-driven-development\` guideline, automate from the designed cases (which trace to the spec) in spec → case → test order — never write a test ahead of its recorded criterion.
2. Keep tests independent, deterministic, and parallel-safe; externalize URLs/credentials; capture trace/screenshot on failure. Per the \`test-data-management\` guideline, each test owns its data lifecycle — set up and tear down its own isolated, uniquely-named data so the suite gives the same result run alone or in parallel, on a clean or full database.
3. Run the new tests; record the run in \`context/changes/<work-id>/automation.md\` using the **Template** below — every test names the case it covers via a \`Covers: TC<n>\` field, plus the run command and result location. Per the \`documentation\` standard, record the **P3** framework map (\`context/foundation/framework-architecture.md\`) the test code conforms to in the \`built-on:\` frontmatter; the validator link-checks it.
4. On failure, hand off to \`qa-rca\` rather than blindly retrying.

## Template
\`\`\`md
${tpl("automation")}
\`\`\`

## Done when
The new tests pass locally and the run is recorded in \`automation.md\` with a \`Covers:\` field per test.

## Next
- \`qa-rca\` — on failure, find the real cause before retrying.
- \`qa-playwright-cli\` — use the Playwright CLI to record a draft, inspect a trace, or refresh snapshots.
- \`qa-performance\` — when a case carries a non-functional target (response time, throughput, load), verify it with a JMeter plan.
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
    description: "Generate or audit a CI pipeline that runs the chosen framework, publishes results into the report dirs wired into the result MCP, and runs `doctor` as a pull-request gate.",
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
3. Generate (or audit) the pipeline so it: checks out, sets up the runtime + build tool, installs deps (and Playwright browsers / JVM deps as needed), runs the recorded run command for **{{AUTOMATION_FRAMEWORK}}**, and **uploads the result dirs as build artifacts** — the same dirs wired into the result MCP: \`./playwright-report\` + \`./test-results\` (Playwright), \`./reports\` + \`./test-results\` (pytest), Surefire/Serenity (\`./target/surefire-reports\` or Gradle \`./build/reports/tests\`), \`./allure-results\` + \`./allure-report\` when Allure is used, and \`./jmeter-report\` + \`./jmeter-results\` when a JMeter load-test stage runs (\`qa-performance\`). Match the paths in \`tools.md\` exactly — a pipeline that writes results elsewhere breaks legibility.
4. Cache deps/browsers, use a matrix only where it earns its keep, and **fail the build when tests fail** — the iron QA rule holds in CI: work without passing tests is not done. Never add a step that swallows a non-zero test exit.
5. **Add the docs-as-code gate.** Beyond the tests, add a fast read-only step that runs the scaffolder's own validator — \`npx <qa-orchestrator> doctor\` — as a **pull-request gate**, so a drifted or broken \`context/\` scaffold (broken relative links, leftover phase-1 \`{{PLACEHOLDER}}\` markers, a missing iron QA rule, a guideline without good/bad examples) **fails the build the same way a failing test does**. This delivers what the \`documentation-as-code\` guideline promises — docs kept in sync by CI — at the CI boundary. \`doctor\` is deterministic, no-LLM, and exits non-zero on errors, so it is safe and fast on every PR; no extra dependency to install beyond the orchestrator package via \`npx\`. Optionally also run \`npx <qa-orchestrator> update --dry-run\` to surface (without applying) upstream template drift in the PR. Run the gate on pull requests, alongside or before the test job.
6. In **audit** mode, do not rewrite blindly: check the existing pipeline actually runs the framework, fails on test failure, uploads every result dir, **and runs \`doctor\` as a PR gate**; report each gap with the single fix.
7. Record the pipeline file path and how to fetch its artifacts in \`context/foundation/tools.md\` so the result MCP and \`qa-metrics\` know where CI results land.

## Done when
A CI pipeline for the detected provider runs **{{AUTOMATION_FRAMEWORK}}**, fails on test failure, publishes the result dirs the result MCP reads, **and runs \`doctor\` as a PR gate that fails on scaffold errors** — and \`tools.md\` records it. In audit mode, a gap report with one fix per finding (output in **{{REPORT_LANGUAGE_NAME}}**).

## Next
- \`qa-metrics\` — aggregate the now-published CI results into the QA health digest.
- \`qa-rca\` — when a CI run fails, root-cause it from the uploaded artifacts.
- \`qa-performance\` — add a headless JMeter load-test stage that publishes \`./jmeter-report\` + \`./jmeter-results\`.`,
  },
  {
    name: "qa-performance",
    description: "Generate or audit a JMeter load/performance test plan that enforces NFRs (p95/p99, throughput, error-rate), run it headless, and trace every performance case to an NFR.",
    readOnly: false,
    bucket: "automation",
    suggestedModel: "sonnet",
    reads: ["context/foundation/test-plan.md", "context/foundation/tools.md", "context/changes/<work-id>/work.md"],
    writes: ["context/changes/<work-id>/performance.md", "performance plan (.jmx)"],
    body: `## When to use
When a requirement carries a **non-functional** target — response time, throughput, concurrency, error-rate under load — and you need to verify it, or to audit an existing JMeter plan. JMeter-first (the tool-neutral name leaves room for k6/Gatling later). Authoring uses the GUI; **every run is non-GUI/headless** so it is CI-safe.

## Procedure
1. **NFRs first.** Per the \`performance-testing\` guideline, define the budgets *before* scripting: p95/p99 response time, throughput (req/s), max error-rate, and the load profile (load / stress / soak / spike). Per the \`spec-driven-development\` guideline, every performance case **traces to an NFR / acceptance criterion** — the iron QA rule read from the non-functional side. An NFR that isn't written is a blocker to resolve, not a number to invent.
2. **Generate or audit the \`.jmx\` plan.** Build thread groups (the load profile), HTTP/JDBC samplers, response/duration **assertions** that fail the run when an SLA is breached, **think-time timers** (real users pause — no think-time overstates throughput), **CSV Data Set Config** for parametrized/correlated data (never a single hard-coded user), and correlation of dynamic tokens. In **audit** mode, check an existing plan has assertions tied to the NFRs, think-time, and parametrized data; report each gap with one fix.
3. **Run headless.** \`jmeter -n -t plan.jmx -l ./jmeter-results/results.jtl -e -o ./jmeter-report\` — non-GUI, writes the \`.jtl\` log + the HTML dashboard into the dirs the \`jmeter-results\` MCP server reads. GUI is for authoring only; a GUI run in CI is an anti-pattern.
4. **Enforce SLAs and record.** Read the dashboard/\`.jtl\` through the \`jmeter-results\` MCP server; compare **percentiles** (p95/p99) and error-rate against the budgets — never an average, which hides the tail. Record the plan path, run command, the baseline compared against, and pass/fail per NFR in \`context/changes/<work-id>/performance.md\` using the **Template** below — every NFR carries a \`Traces to:\` field naming the \`AC<n>\` it enforces. Per the \`grounding\` rule, every number cites the real result artifact you read; if a target has no recorded baseline, say so rather than inventing one. Per the \`documentation\` standard, record the **P1** application reference (\`context/reference/\`) the NFRs derive from in the \`built-on:\` frontmatter; the validator link-checks it.

## Template
\`\`\`md
${tpl("performance")}
\`\`\`

## Done when
A \`.jmx\` plan exists whose assertions enforce the NFRs, it has run headless, the percentile/error-rate results are compared against the budgets and recorded in \`performance.md\`, and each performance case traces to an NFR. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-ci-pipeline\` — run the headless JMeter plan in CI and publish \`./jmeter-report\` + \`./jmeter-results\`.
- \`qa-rca\` — when an NFR fails, root-cause the regression from the dashboard/\`.jtl\`.
- \`qa-metrics\` — fold the performance pass/fail and trend into the QA health digest.`,
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
3. State the root cause, the evidence chain, and a minimal fix or guard. Distinguish essential vs accidental complexity. Per the \`grounding\` rule, every link in the chain cites a real artifact (\`file:line\`, trace, result-MCP output); if the evidence is inconclusive, say so rather than asserting a cause you cannot trace. Per the \`assumptions\` guideline, any inferred link (a cause the trace only implies) goes in a \`## Assumptions\` table with a concrete basis, its verification step, and a calibrated confidence — never present a suspected cause as a proven one.
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
4. Reference each factory/fixture **by name from the case in \`cases.md\`** (and import it from the test) so data use is traceable to the criterion. Per the \`test-data-management\` guideline, govern the data's lifecycle: each test sets up and tears down its own uniquely-named data (no reliance on pre-existing rows or run order), randomized data uses a pinned/logged seed, and no real PII is ever seeded — note the cleanup mechanism for any data a run leaves behind.

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
3. Read \`context/changes/<work-id>/automation.md\` and reconcile cases against the automated tests in **{{AUTOMATION_FRAMEWORK}}**: a designed case with no automated test, or a test traceable to no case/criterion, is a gap. Pull the real test outcomes through the result MCP server (\`playwright-results\` / \`pytest-results\` / \`jvm-results\`) where available — a case "covered" by a skipped or perpetually-failing test is not truly covered; flag it. In a **multi-repo workspace** the application source a case traces to lives in read-only developer repos at \`../<repo>/\` (see \`repo-map.md\` → "External source repositories") — read it to confirm a trace, ground at \`../<repo>/file:line\`, never write there.
4. Build the **AC ↔ case ↔ test** traceability table and classify each criterion: *covered* (case + passing test), *partial* (case but no/failing test), or *uncovered* (no case). Note orphans (cases/tests tracing to nothing).
5. Output a coverage-gap report in **{{REPORT_LANGUAGE_NAME}}**: the traceability table, a coverage count (covered / partial / uncovered), and a prioritized list of the gaps with the single next action for each. Reinforce the iron QA rule — never propose weakening it. Per the \`grounding\` rule, every "covered" cell cites the real case/test it traces to (and the run that proves it passed) — when in doubt, classify it *partial* or *uncovered* rather than assuming coverage. Per the \`assumptions\` guideline, if you must infer a trace link the artifacts don't make explicit, record it in a \`## Assumptions\` table with its verification step rather than marking the cell *covered* on a guess.

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
3. Compute **criterion coverage** across \`context/changes/\` (and \`context/archive/\` for the baseline): how many acceptance criteria trace to a case and to a passing automated test — reuse the AC ↔ case ↔ test traceability from \`qa-coverage-gap\`. Fold in open items from \`tech-debt-tracker.md\` and known-flaky areas from \`lessons.md\`. In a **multi-repo workspace**, the source behind these criteria lives in read-only developer repos at \`../<repo>/\` (see \`repo-map.md\` → "External source repositories"); read it to ground a number, never write there.
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
    description: "Turn a confirmed product defect into a structured, reproducible bug report with evidence + a paste-ready Jira version.",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "sonnet",
    reads: ["context/changes/<work-id>/automation.md", "context/changes/<work-id>/work.md", "context/foundation/tools.md"],
    writes: ["context/changes/<work-id>/bug-report.md", "context/changes/<work-id>/bug-report.jira"],
    body: `## When to use
After \`qa-rca\` concludes the failure is a product defect (not a test defect) and you need a structured, reproducible report. Reads evidence; writes the canonical report and a paste-ready Jira version.

## Procedure
1. Pull the evidence through the result MCP server (\`playwright-results\` / \`pytest-results\` / \`jvm-results\`) or the paths in \`context/foundation/tools.md\` (trace, screenshot, JUnit XML, logs). What is not in context does not exist; per the \`grounding\` rule, every field below cites real evidence — never invent steps, an environment, or a result you did not observe. Per the \`assumptions\` guideline, anything you had to infer (a step the trace only implies, an unconfirmed environment detail) goes in a \`## Assumptions\` table and is referenced inline as \`(A1)\`, never blended into the reproduction as fact.
2. Confirm reproducibility: minimal, ordered steps from a known state; note environment and the test data used.
3. Fill the template below into \`context/changes/<work-id>/bug-report.md\`. Link the affected acceptance criterion and the work-id; carry the suspected area from \`qa-rca\`. Keep the **Observations / logs** factual and service-level — raw payloads, HTTP codes, stacktraces — not test-internal mechanics.
4. **Produce the paste-ready Jira version.** Transform the canonical Markdown into \`context/changes/<work-id>/bug-report.jira\` using the **Markdown→Jira** conversion below — one deterministic transform, the same machine the ticket refinement uses. Fence logs/stacktraces in \`{code}\` blocks; preserve any \`{code}/{panel}/{info}/{warning}/{noformat}\` macros unchanged. The \`.md\` is the source of truth; the \`.jira\` is its mechanical projection — never let the two diverge in content.
5. If an \`atlassian\` MCP server is configured, propose filing the \`.jira\` body as a Jira issue — mirror it, do not invent fields.

## Template
\`\`\`md
${tpl("bug-report")}
\`\`\`

## Markdown→Jira conversion
${JIRA_CONVERSION_TABLE}

## Done when
\`bug-report.md\` exists with reproducible steps, expected vs actual, severity, evidence links, and a traced acceptance criterion, and \`bug-report.jira\` carries the same content in Jira wiki markup. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

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
    reads: ["context/.scaffold/manifest.json", "context/foundation/repo-map.md"],
    writes: ["context/reference/", "context/foundation/repo-map.md"],
    body: `## When to use
To understand an existing application before planning tests, or to onboard onto an unfamiliar/legacy codebase. Read-only on the application source — it never modifies code; it only reads it and writes documentation under \`context/reference/\` and the phase-2 sections of \`context/foundation/repo-map.md\`.

## Procedure
1. Recon first: from \`context/.scaffold/manifest.json\` and a light scan, identify the language(s), build tool, frameworks, and the obvious entry points (HTTP routes, CLI, jobs, message consumers).
2. Read \`context/foundation/repo-map.md\` — phase 1 already inventoried the build roots, test directories, and test/CI configs there (deterministically, no LLM). Use it as your starting map instead of blind-searching, especially in a large or multi-module/polyglot repo. **Multi-repo workspace:** if \`repo-map.md\` lists "External source repositories", the application source lives in read-only sibling developer repos at \`../<repo>/\` — read them there to map the system, and **never write into them** (the \`multi-repo-boundaries\` guideline).
3. **Propose the documentation structure before writing.** For a large or monolithic codebase, propose how to split it (by module / domain / bounded context / C4 container) and pause for approval (respect autonomy **{{AUTONOMY_LEVEL}}**) — do not dump one giant file. In a **multi-repo workspace**, use the **hybrid layout**: a top-level \`system-overview.md\` for the cross-repo landscape + the C4 L1 context spanning *all* developer repos, and a per-repo \`context/reference/<repo>/\` folder for each repo's C4 L2/L3 detail and its test-surface lens (created on demand per repo, mapping cleanly onto C4 levels — L1 = the system, L2/L3 = per container/repo).
4. Document the architecture with the **C4 model** (see the \`diagram-conventions\` guideline), top-down: L1 system context in \`c4-context.md\`, L2 containers in \`c4-container.md\`, L3 components (for the testing-critical containers) in \`c4-component.md\`. Skip L4 (code) unless a specific component needs it — link to source instead. Index everything from \`system-overview.md\` and fill its business-context section. (Multi-repo: the top-level L1 spans all developer repos; per-repo L2/L3 live under \`context/reference/<repo>/\`, each grounded at \`../<repo>/file:line\`.)
   Then fill the **Test surface (QA lens)** — the testing view that sits over the C4 architecture: **Integration points** (every system this one talks to, with direction/protocol/data/test-focus — the map for integration-test planning), the **Entry-point inventory** (each HTTP route / CLI / job / consumer at its \`file:line\`, marked covered/uncovered), the **API / endpoint inventory** (each callable API with its method/path, auth, request/response fields, and status codes at its \`file:line\` — the contract detail API case design needs), **Data model & boundaries** (each field/entity with its valid vs invalid/boundary values, for case design), a **Test scenarios summary**, and a **Questions & issues** table. Every cell is grounded at \`file:line\`; anything inferred goes in the Assumptions table, not the lens. Finally, run the **Completeness verification** checklist — confirm every endpoint/entry-point is inventoried and grounded, and that gaps are recorded rather than silently dropped.
5. Each C4 level carries one Mermaid diagram (\`C4Context\` / \`C4Container\` / \`C4Component\`, or the \`flowchart\` fallback) plus supporting prose. Zoom in only as far as the testing question needs — most QA work lives at L1–L3.
6. Enrich \`repo-map.md\`'s phase-2 sections: fill **Test ↔ source map** (map each test directory from the inventory to the C4 container/component it exercises, reusing those names so the two maps agree) and **Entry points** (each route/CLI/job/consumer linked to the test directory that covers it, or flagged uncovered). Leave the phase-1 inventory section as the auto-generated map — don't hand-edit it.
7. Link to real paths in the repo; never paste large code — reference it. Keep each doc lean and verifiable. Per the \`grounding\` rule, confirm every path / symbol / integration by opening it before documenting it — never invent an architecture. Per the \`assumptions\` guideline, record anything you could not verify in a \`## Assumptions\` table (basis, impact, verification, calibrated confidence) and reference it inline as \`(A1)\` — inferred architecture stated as fact is a hallucination.

## Done when
\`context/reference/\` holds the agreed C4-structured docs (L1–L3 as needed) and \`repo-map.md\`'s phase-2 test↔source / entry-point sections are filled, with no unresolved \`{{PLACEHOLDER}}\` markers, indexed from \`system-overview.md\` and tracing to real source paths. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-ticket-review\` / \`qa-test-plan\` — now informed by the system map and the test↔source repo map.
- \`qa-doc-critic\` — semantic-review the generated reference docs against the documentation standard + grounding.
- \`qa-gardening\` — can read \`context/reference/\` and \`repo-map.md\` to flag drift between the map and the code.`,
  },
  {
    name: "qa-framework-analyze",
    description: "Reverse-engineer the test-framework code into a generated structural map (framework-architecture.md = pillar P3) so authored test code matches the framework as documented.",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: [
      "context/.scaffold/manifest.json",
      "context/foundation/repo-map.md",
      "context/foundation/test-framework.md",
    ],
    writes: ["context/foundation/framework-architecture.md"],
    body: `## When to use
To document the test-automation framework's structure before authoring tests in an unfamiliar/legacy suite, or to refresh the map after the framework evolves. Read-only on the framework code — it reads the base classes / fixtures / page-objects / config and writes the **generated structural map** \`context/foundation/framework-architecture.md\` (pillar **P3**). Twin of \`qa-reverse-engineer\` (which maps the *application* source, P1); this maps the *test framework*. Distinct from \`test-framework.md\`, the hand-authored how-to-run onboarding guide.

## Procedure
1. Recon the framework from \`context/.scaffold/manifest.json\`, \`context/foundation/repo-map.md\` (test directories), and \`context/foundation/test-framework.md\` (the onboarding guide) — identify the framework **{{AUTOMATION_FRAMEWORK}}**, the test roots, and the obvious building blocks.
2. Read the framework code read-only: base test class(es) and lifecycle hooks, shared fixtures / DI, page objects / request builders / clients, configuration & environment wiring, and extension points. Open each before documenting it (\`grounding\`) — never infer a base class or fixture you didn't read. In a **multi-repo workspace** the framework lives in the test repo; any application source it drives sits in read-only developer repos at \`../<repo>/\` (see \`repo-map.md\` → "External source repositories" and the \`multi-repo-boundaries\` guideline) — read it there, ground at \`../<repo>/file:line\`, write only into the test repo.
3. Write \`context/foundation/framework-architecture.md\` from its seeded template, filling each section grounded at \`file:line\`: the architecture diagram (one guarded Mermaid component/flowchart per \`diagram-conventions\`), base classes & lifecycle, fixtures, abstractions, config, and extension points. Per the \`documentation\` standard keep it lean and conformant — single H1, the seeded frontmatter (bump \`version\` / \`last-updated\`, set \`status\`), link to source rather than pasting it.
4. Per the \`assumptions\` guideline, anything you couldn't verify in the framework code goes in a \`## Assumptions\` table (basis, impact, verification, calibrated confidence), referenced inline as \`(A1)\` — never state an inferred structure as fact.

## Done when
\`framework-architecture.md\` documents the base classes, fixtures, abstractions, config, and extension points — each grounded at \`file:line\`, with a guarded architecture diagram and no unresolved \`{{PLACEHOLDER}}\` markers. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Next
- \`qa-test-automate\` — author tests against the documented framework architecture (P3).
- \`qa-doc-critic\` — semantic-review the generated map against the documentation standard + grounding.
- \`qa-gardening\` — can read \`framework-architecture.md\` to flag drift between the map and the framework code.`,
  },
  {
    name: "qa-knowledge",
    description: "Build a durable P2 knowledge base (domain, glossary, business rules, decisions) under context/knowledge/ from Jira/Confluence via the MCP fetch layer.",
    readOnly: false,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: ["context/foundation/test-strategy.md", "context/reference/system-overview.md"],
    writes: ["context/knowledge/<topic>.md"],
    body: `## When to use
To build a durable **P2** knowledge base from Jira/Confluence — domain concepts, glossary, business rules, decisions — so plans and cases rest on documented requirements knowledge instead of one-off per-run fetches. Run when onboarding a domain or when the requirements space has moved. Uses the R-065 MCP fetch layer; writes durable knowledge docs under \`context/knowledge/\` (sibling to \`context/reference/\`, the P1 pillar). "Querying" the knowledge base = the agent just reads these docs — there is no separate oracle skill.

## Procedure
1. **Fetch through MCP — never summarize from a title.** Per the \`mcp-content-fetch\` guideline, follow download → verify → convert → read: the indicated Confluence pages (\`getPage\` / \`searchConfluence\`), linked Jira epics (\`getIssue\`), and attachments (\`getAttachments\` / \`getAttachmentContent\` → \`markitdown\` on the local path). What's not fetched doesn't exist.
2. **Synthesize one durable doc per topic** at \`context/knowledge/<topic>.md\` from the **Template** below: Domain, Glossary, Business rules, Decisions — each fact cited to its Confluence page / Jira key (\`grounding\`). Per the \`documentation\` standard, write conformant durable frontmatter (\`title\`/\`version\`/\`last-updated\`/\`owner-skill\`/\`status\`), a single H1, and keep it lean — link out to the source page, don't restate it.
3. Per the \`assumptions\` guideline, anything you infer beyond the fetched sources goes in a \`## Assumptions\` table referenced inline as \`(A1)\`; flag conflicting sources explicitly rather than silently picking one.
4. Output prose in **{{REPORT_LANGUAGE_NAME}}**.

## Template
\`\`\`md
${tpl("knowledge")}
\`\`\`

## Done when
\`context/knowledge/<topic>.md\` exists with Domain / Glossary / Business rules / Decisions, every fact cited to a fetched source, conformant durable frontmatter, and no unresolved \`{{PLACEHOLDER}}\` markers.

## Next
- \`qa-plan\` / \`qa-test-case-design\` — plan and design cases resting on the P2 knowledge base (record it in \`built-on:\`).
- \`qa-doc-critic\` — semantic-review the knowledge docs against the documentation standard + grounding.`,
  },
  {
    name: "qa-doc-critic",
    description: "Semantic quality gate over a single generated document — hallucination, assumptions-table, citation, and documentation-standard conformance (read-only).",
    readOnly: true,
    bucket: "analysis",
    suggestedModel: "opus",
    reads: [
      "context/reference/",
      "context/knowledge/",
      "context/foundation/",
      "context/changes/",
    ],
    writes: [],
    body: `## When to use
After a document is generated or substantially edited (a P1 reference, a P2 knowledge doc, the P3 \`framework-architecture.md\`, a refinement, or a plan) — to semantic-review **that one document** before it's relied on. Read-only: it reports findings in chat, it never edits. Single-document quality is its lane, distinct from its siblings:
- \`doctor\` — mechanical, no-LLM (structure, links, placeholders, frontmatter presence).
- \`qa-gardening\` — repo-wide drift sweep across \`context/\`.
- \`qa-review\` — work-item coverage / traceability.
- \`qa-doc-critic\` — the semantic quality of one document.

## Procedure
1. Read the target document and the standards it must meet: the \`documentation\` meta-standard (frontmatter, single H1, "when to use", length discipline), \`grounding\` (every claim cited), and \`assumptions\` (inference legal only inside the table).
2. **Hallucination check.** For every factual claim — path, symbol, endpoint, ticket key, result — confirm it cites a real artifact; run the identifier scrub from the \`grounding\` guideline and flag any uncited or unverifiable claim.
3. **Assumptions-table completeness.** Every inferred claim sits in a \`## Assumptions\` table with a concrete basis (never "common practice") and a calibrated confidence; every inline \`(A1)\` resolves to a row; flag any inference stated as fact outside the table.
4. **Standard conformance.** Frontmatter keys present and sensible, exactly one H1, a when-to-use lede, length discipline (no restating source that should be linked), and every Mermaid block guarded per \`diagram-conventions\`.
5. Output a prioritized findings list in **{{REPORT_LANGUAGE_NAME}}**: each item names what's wrong, where (\`file:line\` / section), why it matters, and the single fix — to be handed to the document's owning write skill. Reinforce \`grounding\` and the iron QA rule — never propose weakening them.

## Done when
A prioritized critique of the single document exists — hallucination, assumptions, citation, and standard-conformance findings, each with a concrete fix. No files were modified.

## Next
- \`qa-reverse-engineer\` / \`qa-knowledge\` / \`qa-framework-analyze\` / \`qa-ticket-review\` / \`qa-plan\` — hand each finding to the skill that owns the document.
- \`qa-gardening\` — fold recurring doc-quality issues into the next repo-wide drift sweep.`,
  },
];

/**
 * R-033 — standing "read related guidelines before acting" step. Injected at the
 * top of every **write** skill's procedure so the rule lives once here and stays
 * in lock-step across the suite (read-only skills don't change files, so they are
 * left untouched). Mirrors the "Read before you write" rule in the lean root map.
 */
const READ_FIRST_STEP =
  "> **Read first (standing rule):** before changing anything, read the guidelines/standards related to this task — at minimum `qa-conventions` and `test-naming`, plus any that apply (`spec-driven-development`, `grounding`, `assumptions`, `documentation-as-code`, `diagram-conventions`). See \"Read before you write\" in the root map.";

/** The full MVP skill suite, in workflow order. */
export const SKILLS: LogicalSkill[] = [...backbone, ...design, ...automation, ...analysis].map((s) =>
  s.readOnly
    ? s
    : // Inject the standing read-first rule (R-033) and, ahead of it, the multi-repo
      // write-boundary rule (R-085, rendered to "" on a single-repo scaffold so the
      // output is byte-identical). Both are blockquotes, so the skill-catalog
      // generator (numbered steps only) is unaffected.
      { ...s, body: s.body.replace("## Procedure\n", `## Procedure\n{{MULTI_REPO_RULE}}${READ_FIRST_STEP}\n\n`) },
);
