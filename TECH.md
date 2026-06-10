# TECH — QA Process Orchestration (architecture & contracts)

> Technical design for the twin npx packages described in **PRD.md**. Covers the monorepo layout,
> the shared-core + platform-adapter architecture, module contracts, the logical→platform artifact
> mapping, build/release, and testing strategy.
>
> Status: **Draft v0.1** · Targets Node ≥ 20, ESM. Delivery status & per-item tracking: **[`ROADMAP.md`](ROADMAP.md)**.

---

## 1. Monorepo layout

The repo becomes an npm-workspaces monorepo. Only the two leaf packages are published; `core` is a
private workspace bundled into each leaf at build time (so npx users never pull a third package).

```
ai-process-orchestration/
├── package.json                 # private root, "workspaces": ["packages/*"]
├── PRD.md / TECH.md
├── CLAUDE.md                    # updated: cli/ section → packages/*
├── packages/
│   ├── core/                    # @qa-orch/core — private, not published, bundled into leaves
│   │   └── src/{detect,wizard,scaffold,render,model,adapters,util}
│   ├── claude-qa-orchestrator/  # published npx package
│   └── copilot-qa-orchestrator/ # published npx package
├── vscode/auditskill/           # unchanged, separate artifact (Copilot config auditor)
└── knowledge-markdowns/         # reference only
```

The existing `cli/` package is **moved and split**: its platform-agnostic modules become
`packages/core`; its Claude-specific pieces (paths, skill template, CLI messages) become
`packages/claude-qa-orchestrator`. The current package (`claude-agent-scaffold` v0.1.0) is
**superseded** by `claude-qa-orchestrator` (QA domain). Empty `claude/` and `mcp/` are removed.

## 2. Two-phase architecture (preserved from the current CLI)

- **Phase 1 — installer (`npx <pkg> init`), 100% deterministic, NO LLM.** Detects the test stack,
  runs the `@clack/prompts` wizard (or `--yes` for CI), and writes the `context/` skeleton +
  guidelines + platform skill/prompt files with `{{PLACEHOLDER}}` markers, skip-if-exists. Does not
  read `ANTHROPIC_API_KEY` or call any model API.
- **Phase 2 — installed skill/prompt, LLM, runs inside the tool.** Interviews the QA engineer per
  skill and fills the remaining placeholders into finished artifacts.
  - Claude: `.claude/skills/<name>/SKILL.md` (frontmatter `allowed-tools`).
  - Copilot: `.github/prompts/<name>.prompt.md`, orchestrated by `.github/agents/qa-orchestrator.agent.md`.

## 3. Core modules & contracts (`packages/core`)

Reuses the current `cli/src` structure, extended. Key modules and their responsibilities:

- **`detect/`** — `detectStack(root): DetectedStack`. Per-language detectors (`node.ts`, `java.ts`,
  `python.ts`) extended with **test-stack detection** (see §8). Light parsing only: `JSON.parse` for
  `package.json`, substring/regex for `pom.xml` / `build.gradle`. Polyglot collects all, picks one
  primary by priority.
- **`wizard/`** — `runWizard(stack): Answers | null` (interactive) and `defaultAnswers(stack)`
  (`--yes`/CI). Questions reframed for QA (project type, automation framework, report language,
  autonomy level). Both seed from `labels.ts`.
- **`render.ts`** — `render(template, vars): string`. `{{KEY}}` substitution; **unknown placeholders
  left intact** for phase 2. Reused verbatim.
- **`scaffold/`** — `scaffold(input): WriteResult[]`. Writes the `context/` skeleton + guidelines
  (skip-if-exists) + `.scaffold/manifest.json` (phase-2 handoff state).
- **`model/`** — the **logical QA skill definitions**: each skill's name, description, procedure
  body, inputs/outputs, and which `context/` files it reads/writes — expressed once,
  platform-agnostic. This is where functional parity is guaranteed.
- **`adapters/`** — the `PlatformAdapter` interface (see §5) that maps a logical artifact to a
  platform-specific path + frontmatter.
- **`util/fs.ts`** (`exists`, `readIfExists`, `firstExisting`), **`labels.ts`**,
  **`templates-path.ts`** (`templatesDir()` resolved from `import.meta.url`, works in `src/` and
  bundled `dist/`).

Each leaf package is `core` + one `PlatformAdapter` implementation + that platform's templates.

## 4. Platform mapping table (logical artifact → platform)

| Logical artifact | Claude | Copilot |
|---|---|---|
| Lean root config | `CLAUDE.md` | `.github/copilot-instructions.md` |
| Guideline | `.ai/guidelines/*.md` | `.github/instructions/*.instructions.md` |
| Skill (procedure) | `.claude/skills/<name>/SKILL.md` (`allowed-tools`) | `.github/prompts/<name>.prompt.md` |
| Orchestrator/agent | skills + `CLAUDE.md` | `.github/agents/qa-orchestrator.agent.md` (`handoffs[]`) |
| MCP | `.mcp.json` / settings | `.vscode/mcp.json` |
| Quality gates / hooks | `.claude/settings.json` (PostToolUse) | `.github/instructions` + documented manual gate |
| System of record | `context/**` | `context/**` (identical) |

## 5. Skill model & `PlatformAdapter`

A logical skill from `core/model` renders to different surfaces:

- **Claude** → `.claude/skills/<name>/SKILL.md` with YAML frontmatter incl. `model` (the suggested
  tier) and `allowed-tools`.
- **Copilot** → `.github/prompts/<name>.prompt.md`; cross-skill choreography is expressed via the
  orchestrator agent's `handoffs[]` (frontmatter shape proven by
  `vscode/auditskill/.github/agents/audit-agents.agent.md`: `description`, `model`, `tools[]`,
  `agents[]`, `user-invokable`, `argument-hint`, `handoffs[{label,agent,prompt,send}]`, `target`).
  Copilot prompts carry no per-prompt model field, so `suggestedModel` is documentation-only there.

```ts
interface LogicalSkill {
  name: string;                 // e.g. "qa-ticket-review"
  description: string;
  readOnly: boolean;            // read-only skills get no write tools in the allowlist
  bucket: "backbone" | "design" | "automation" | "analysis";
  suggestedModel: "opus" | "sonnet" | "haiku"; // matched to cognitive load; -> Claude `model:` frontmatter
  reads: string[];              // context/ paths it consumes
  writes: string[];             // context/ paths it produces
  body: string;                 // procedure text (may contain {{PLACEHOLDER}} for phase 2)
}

interface PlatformAdapter {
  id: "claude" | "copilot";
  rootConfigPath(): string;                         // CLAUDE.md | .github/copilot-instructions.md
  guidelinePath(name: string): string;
  renderSkill(skill: LogicalSkill, vars): WriteFile[]; // -> SKILL.md | prompt.md (+ agent handoff)
  mcpPath(): string;                                // .mcp.json | .vscode/mcp.json
  hooks(vars): WriteFile[];                          // .claude/settings.json | [] (manual gate doc)
}
```

### Skill × model × tooling matrix (R-014)

The single authoritative view of the suite: each skill's bucket, read/write mode, **suggested model
tier**, and the MCP/tooling it leans on. **Naming standard (R-017): every skill is `qa-<name>`** — a
uniform prefix so the suite is unambiguous in the tool's skill/prompt picker and never collides with a
target repo's own skills. `suggestedModel` is defined once on the `LogicalSkill`
(`core/src/model/skills.ts`) and rendered into Claude `SKILL.md` `model:` frontmatter; on Copilot it is
documentation-only (prompts have no model field). Heuristic: **`opus`** for heavy reasoning (risk
analysis, case derivation, root cause, coverage judgment), **`haiku`** for mechanical steps (id +
file creation, archive moves), **`sonnet`** for the balanced middle.

| Skill | Bucket | Mode | Suggested model | Why | MCP / tooling |
|---|---|---|---|---|---|
| `qa-init` | backbone | write | `sonnet` | guided interview + fill foundation | reads `manifest.json` |
| `qa-new` | backbone | write | `haiku` | mechanical: stable id + `work.md` | — |
| `qa-plan` | backbone | write | `opus` | risk/strategy reasoning | — |
| `qa-implement` | backbone | write | `sonnet` | orchestration / delegation | result servers (indirect) |
| `qa-review` | backbone | read | `opus` | coverage + traceability judgment | result servers |
| `qa-archive` | backbone | write | `haiku` | mechanical: append + move | — |
| `qa-ticket-review` | design | read | `opus` | ambiguity + risk analysis | `atlassian` (opt-in) |
| `qa-test-plan` | design | write | `sonnet` | strategy-level doc | — |
| `qa-test-case-design` | design | write | `opus` | derive negative/boundary cases | — |
| `qa-automation-bootstrapper` | automation | write | `sonnet` | framework setup + wiring | result servers |
| `qa-test-automate` | automation | write | `opus` | author robust test code | result servers |
| `qa-playwright-cli` | automation | write | `sonnet` | drive Playwright CLI (codegen/trace/snapshots) | Playwright CLI, browser MCP (opt-in) |
| `qa-ci-pipeline` | automation | write | `sonnet` | generate/audit CI that runs the framework + publishes result dirs | reads `tools.md` + `manifest.json`, targets result-MCP dirs |
| `qa-rca` | analysis | read | `opus` | root-cause reasoning | result servers |
| `qa-test-data-gen` | analysis | write | `sonnet` | reusable schema-valid factories/fixtures | stack-aware (faker/factory_boy/datafaker) |
| `qa-gardening` | analysis | read | `sonnet` | scan + prioritize drift | reads `doctor` output |
| `qa-bug-report` | analysis | write | `sonnet` | structured defect report from evidence | result servers, `atlassian` (opt-in) |
| `qa-reverse-engineer` | analysis | write | `opus` | reverse-engineer code → project docs | reads app source (read-only on code) |
| `qa-coverage-gap` | analysis | read | `opus` | AC ↔ case ↔ test traceability + uncovered criteria | result servers |
| `qa-metrics` | analysis | read | `sonnet` | pass/fail/flake + coverage digest across runs | result servers (+ Allure history) |

"Result servers" = the stack-appropriate read-only MCP server wired in phase 1: `playwright-results`,
`pytest-results`, or `jvm-results` (see `core/src/model/mcp.ts`). When detection finds **Allure**
(`DetectedStack.observability`), its `allure-results` + `allure-report` (durable cross-run history) dirs
are appended to that server — so `qa-metrics` reads flakiness/trends, not just the latest run (R-012).

**Orchestration via `## Next` (R-020).** Every skill body ends with a `## Next` section recommending
the downstream skill(s) — the agent-orchestration graph is encoded in the skills themselves, not in a
separate router. `qa-reverse-engineer` writes durable system docs to `context/reference/`; `qa-bug-report`
closes the `qa-rca` → defect gap; `qa-coverage-gap` (R-022) maps AC ↔ case ↔ test and reports uncovered
criteria, feeding `qa-test-case-design` / `qa-test-automate`. `qa-ci-pipeline` (R-027) extends `qa-test-automate`'s
`## Next`: once tests pass locally, it generates/audits a CI pipeline (GitHub Actions / GitLab CI / Azure
Pipelines) that runs the framework and publishes the result-MCP dirs, so `qa-metrics` / `qa-rca` read CI
outcomes the same way they read local runs — the test → report → legibility loop closed at the CI boundary.

The leaf CLI = parse args → `detectStack` → `runWizard`/`defaultAnswers` → for each `LogicalSkill`
call `adapter.renderSkill` → `scaffold` `context/` + guidelines + adapter outputs.

## 6. Context system of record (platform-agnostic)

```
context/
├── foundation/   test-strategy.md, test-plan.md, tools.md, environments.md, lessons.md, tech-debt-tracker.md
├── changes/<work-id>/   work.md, plan.md, cases.md, automation.md, bug-report.md
├── archive/<work-id>/   (read-only)
└── reference/   system-overview.md + reverse-engineered docs (qa-reverse-engineer)
```

- The lean root config is an **index**, not a repository; skills fetch from `context/` just-in-time
  (hierarchical / pull-based retrieval, not upfront injection). Critical, non-negotiable rules live in
  the lean root so they **survive context compaction**.
- `foundation/` is edited in place; per-work-item docs live under `changes/<work-id>/`; completed
  items move to `archive/`.
- **Large outputs are offloaded to files** under `changes/<work-id>/` and referenced by path, rather
  than pasted inline — keeps the working context bounded.
- `context/` docs are **machine-readable and cross-linked** (relative links between foundation docs and
  work-items); a deterministic validator (see §11) can check link/section integrity outside the agent loop.
- **Work-item IDs are deterministic hashes** so re-runs stay stable — mirrors the `F-###` / `OPT-###`
  determinism in `vscode/auditskill`.

## 7. Build & release

- **tsup** per leaf package: bundles `core` (via workspace import) into a single ESM `dist/index.js`
  with a `#!/usr/bin/env node` banner, and an `onSuccess` step that copies `src/templates` →
  `dist/templates` (same pattern as the current `cli/tsup.config.ts`). Keep that copy step.
- Each leaf has its own `package.json` `version`, `bin`, `files: ["dist", "README.md"]`, `engines.node >= 20`,
  and `prepublishOnly: typecheck && test && build`. **Independent versioning and release.**
- `@clack/prompts` is the only runtime dep (carried from the current CLI); shared via core, bundled.
- npx smoke test in CI: run each `dist/index.js init --root <tmp> --yes` and assert the output tree.

## 8. Detection details (test stacks)

| Stack | Manifest / marker |
|---|---|
| Playwright (TS/JS) | `@playwright/test` in `package.json`; `playwright.config.{ts,js,mjs}` |
| Playwright (Java) | `com.microsoft.playwright` in `pom.xml` / `build.gradle(.kts)` |
| RestAssured (Java) | `io.rest-assured` in `pom.xml` / `build.gradle(.kts)` |
| JVM runner | JUnit 5 (`org.junit.jupiter`) / TestNG (`org.testng`); Maven vs Gradle (already partly in `detect/java.ts`) |

Detection feeds wizard defaults (chosen automation framework, primary language). The iron QA rule
(carried from the current templates) always requires tests in the detected/chosen `{{TEST_FRAMEWORK}}`.

## 9. Testing strategy

- **vitest** in `core` and each leaf (reuse the current `tempProject()` fixture pattern).
- `detect.test.ts` — extended with Playwright TS/Java and RestAssured fixtures + polyglot priority.
- `render.test.ts` — unchanged contract (known replaced, unknown preserved).
- `scaffold.test.ts` — `context/` tree, manifest validity, idempotency, iron-QA-rule injection.
- **Per-adapter snapshot tests** — render the full skill suite for each platform and assert the
  generated tree; a **parity test** asserts both platforms emit the same set of logical skills and an
  identical `context/` skeleton (only paths/frontmatter differ).

## 10. Compatibility & invariants

- Node ≥ 20, ESM throughout.
- **Never overwrite**: scaffolding is skip-if-exists; regeneration requires deleting `context/` / config.
- Phase 1 never uses an LLM or `ANTHROPIC_API_KEY`.
- Functional parity between packages is an invariant enforced by the parity snapshot test.
- This repo's user-facing skill strings stay PL (per `CLAUDE.md`); package code, identifiers, JSON
  keys, and these design docs are EN.

## 11. Harness-engineering alignment

What we scaffold **is a harness** — the execution environment around the QA agent (what it can read,
which tools it calls, how it validates, when it stops). The patterns below come from OpenAI's
"Harness engineering" (Codex) report and the 10xDevs-3 context-scaling lesson; both say the same thing:
*the harness is the car, the model is the engine.* Concrete commitments for our packages:

- **Map, not a thousand-page manual.** Lean root config (~100 lines) is a **table of contents**;
  knowledge lives in `context/` and is pulled just-in-time (progressive disclosure). This directly
  counters the four failure modes of a monolithic root file: context is scarce, "everything important"
  ⇒ nothing is, instant rot, and un-verifiability.
- **"What's not in context doesn't exist."** QA knowledge stuck in Jira/Slack/people's heads is
  invisible to the agent. The scaffolded `context/foundation/` (test-strategy, test-plan, tools,
  environments, lessons) is the place to **encode** that knowledge as versioned repo artifacts.
- **Plans as first-class artifacts.** `context/changes/<id>/` (active) and `context/archive/` (done)
  mirror Codex's `exec-plans/active|completed`. Add `context/foundation/tech-debt-tracker.md` (or
  `lessons.md`) as a versioned, agent-readable backlog of test debt / known flaky areas / RCA history.
- **Invariants over micromanagement.** Enforce a small set of inviolable rules, not implementation
  detail: the iron QA rule (tests in the detected framework), every test case traces to an acceptance
  criterion, every automated test carries a stable ID, deterministic work-item IDs. Leave *how* to the agent.
- **Mechanical enforcement + remediation-carrying errors.** A deterministic validator (the QA analog
  of `vscode/auditskill`) checks structure, cross-links, and placeholders **outside the agent loop**;
  its findings carry fix instructions so they can be fed back into agent context. **Shipped** as the
  **`doctor`** command (`core/src/doctor/index.ts`, `runDoctor`; exits non-zero on errors) and the
  recurring read-only **`qa-gardening`** skill (shipped R-004) that folds in `doctor`'s findings and hands
  each targeted fix to the right write skill.
- **Make test results legible to the agent.** ✅ **Shipped.** The QA analog of Codex's Chrome DevTools /
  observability wiring: phase 1 provisions a read-only `playwright-results` filesystem **MCP server**
  (`.mcp.json` / `.vscode/mcp.json`) over the Playwright HTML report + traces (`core/src/model/mcp.ts`,
  `resultServers`), so `qa-rca` and `qa-test-automate` read outcomes directly instead of relying on copy-paste.
  Both adapters share the server map; only the JSON envelope differs (`mcpServers` vs `servers`). **Extended
  in R-012:** detection of **Allure** (`DetectedStack.observability`) appends its durable cross-run history
  (`allure-report/history`) + results dirs to the result server, lifting legibility past a single static
  report dir; the read-only **`qa-metrics`** skill then aggregates pass/fail/flakiness + criterion-coverage
  across runs into a digest. **R-023** adds an opt-in (default off) official `@playwright/mcp` **browser**
  server (`browserServers` in `core/src/model/mcp.ts`) for *interactive* exploration in
  `qa-test-case-design` / `qa-rca` — distinct from the read-only result servers, which only read static
  artifacts. No secrets, so it renders identically on both platforms (only the envelope key differs).
- **Read-only vs. write skills.** Each `LogicalSkill` is annotated read-only (`qa-ticket-review`,
  `qa-review`, `qa-rca`, `qa-gardening`) or write (`qa-test-case-design`, `qa-test-automate`,
  `qa-automation-bootstrapper`, …); the adapter encodes this as Claude `allowed-tools` and as Copilot agent
  tool allowlists — schema-level filtering, not prose. Each skill also carries a `suggestedModel` tier
  (R-014), rendered as Claude `model:` frontmatter — see the matrix in §5.
- **Compaction survival.** The handful of inviolable rules live in the lean root so they persist when
  the conversation is compacted over long QA sessions.

## 12. Scaffolded-guidelines standard & flow reference (R-015)

### 12.1 Guideline docs — the standard

Phase 1 scaffolds a small, fixed set of **guideline docs** from `GUIDELINES` in
`core/src/model/context.ts`. They are platform-agnostic content; only the path differs (Claude
`.ai/guidelines/<name>.md`, Copilot `.github/instructions/<name>.instructions.md` — `adapter.guidelineRel`).
Current set:

| Guideline | Purpose | Phase-1 seeded | Phase-2 `{{PLACEHOLDER}}` |
|---|---|---|---|
| `qa-conventions` | how tests are written here | framework, linters, wizard QA rules (`QA_CONVENTIONS`), ✅/❌ examples | `PROJECT_SPECIFIC_CONVENTIONS`, `CONVENTIONS_PATTERNS` |
| `test-naming` | naming + traceability of cases/specs | project language, framework, ✅/❌ examples | `NAMING_RULES`, `NAMING_EXAMPLES`, `NAMING_PATTERNS` |
| `diagram-conventions` | the Mermaid standard for diagrams in `context/` + reports (R-025) | the standard + a ✅/❌ example diagram | `PROJECT_DIAGRAMS`, `DIAGRAM_PATTERNS` |

Standard each guideline follows:

- **Two-phase fill.** A leading note states what phase 1 seeded and what phase 2 must refine. Phase-1
  fields are rendered deterministically; remaining `{{PLACEHOLDER}}` sections are left intact for the
  in-tool LLM (`render.ts` preserves unknown placeholders).
- **Lean & non-obvious.** Record only project-specific rules an agent would otherwise get wrong — not
  general testing advice. Link out to `context/foundation/*`, don't duplicate it.
- **Reinforces, never weakens, the iron QA rule.** Test-quality rules (one behavior per test;
  deterministic/independent/parallel-safe; negative + boundary coverage; diagnostics on failure) are
  non-negotiable and must survive phase-2 edits.
- **Mandatory ✅ good / ❌ bad examples (R-026).** Every guideline *shows* the pattern, it doesn't just
  describe it: each carries a `## Examples (✅ good / ❌ bad — required)` section with a concrete good
  case and a concrete bad case. `doctor` enforces this — a guideline file missing either the `✅` or
  `❌` marker is an **error** (`GUIDELINE:examples:<name>`). Keep examples short and free of relative
  Markdown/image links (`[..](..)` / `![..](..)`) so they don't trip the broken-link check.
- **Encouraged "Applicable patterns" section.** Each guideline ends with an `## Applicable patterns`
  section (phase-2 placeholder, e.g. `CONVENTIONS_PATTERNS`, `NAMING_PATTERNS`, `DIAGRAM_PATTERNS`)
  naming the design / programming / testing patterns this codebase applies (Page Object,
  Arrange-Act-Assert, Builder for test data, C4 levels, …) so agents reach for the right shape. Not
  enforced by `doctor` (encouraged, not mandatory).
- **Adding a guideline** = append to `GUIDELINES` (name, title, body); both adapters render it via
  `guidelineRel`; `doctor` then expects it to exist **and to carry both example markers**
  (`doctor/index.ts` builds its file set from `GUIDELINES`). Keep the body platform-agnostic so parity
  holds.

### 12.2 Diagram standard — Mermaid (R-025)

The `diagram-conventions` guideline fixes **Mermaid** as the diagram format for everything under
`context/` and in reports: fenced ```` ```mermaid ```` blocks render in the tool and on the repo host,
diff cleanly, and never rot into a stale binary image. The standard maps a diagram type to a use:
`flowchart` (process/decision flow), `sequenceDiagram` (interactions over time — `qa-rca` repros,
integration design), `stateDiagram-v2` (entity lifecycle under test), `erDiagram` (data shapes that must
match a schema — pairs with `qa-test-data-gen`). Rules: one diagram per block, explicit direction,
meaningful labels, ~15-node cap (split by domain past that), and the diagram **supports** prose +
traceability — it never displaces the rule that every case traces to an acceptance criterion. The
guideline ships an example flowchart (AC → case → test → `qa-rca`/`qa-review`) and a phase-2
`{{PROJECT_DIAGRAMS}}` slot for the product's canonical diagrams. As with any guideline, it is added by
appending to `GUIDELINES`; both adapters render it and `doctor` then expects it.

### 12.3 Flow reference (phase 1 → phase 2 → daily loop)

**Phase 1 — installer (`npx <pkg> init`), deterministic, no LLM** (`cli.ts` → `scaffold/index.ts`):
`detectStack` → `runWizard` (or `defaultAnswers` for `--yes`) → `scaffold` writes, skip-if-exists, the
lean root config + guidelines + the full skill suite + MCP config + the `context/` skeleton +
`.scaffold/manifest.json`. Only **phase-1 placeholders** are rendered (`PHASE1_VAR_NAMES`); everything
else is left for phase 2. No model API, no `ANTHROPIC_API_KEY`.

**Phase 2 — in the tool (LLM).** `qa-init` reads `manifest.json`, interviews the QA owner, and fills the
remaining `{{PLACEHOLDER}}` markers in `context/foundation/*` and the guideline docs. Subsequent skills
fill their own placeholders as they run.

**Daily work-item loop** (state of record = `context/`, read before acting / update after):
`qa-new` → `qa-ticket-review` → `qa-test-plan` / `qa-test-case-design` → `qa-automation-bootstrapper` (first time) /
`qa-test-automate` → run → `qa-rca` (on failure) → `qa-review` → `qa-archive`. On a product defect `qa-rca`
hands off to `qa-bug-report`. Out of band: `qa-reverse-engineer` builds `context/reference/` to understand
an app before testing; `qa-gardening` sweeps drift on a cadence; `doctor` validates structure outside the
agent loop. Each skill's `## Next` section names its recommended successors (R-020).
