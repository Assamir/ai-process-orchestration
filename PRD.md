# PRD — QA Process Orchestration (twin npx packages)

> Product requirements for two independent, separately versioned npx packages that scaffold an
> AI-driven **QA / testing-process** orchestration into a target repository — one for **Claude
> Code (CLI)** and one for **GitHub Copilot in VS Code** — delivering functional parity.
>
> Status: **Draft v0.1** · Owner: repo maintainer · Language: EN (code + identifiers EN; this repo's
> user-facing skill strings remain PL per `CLAUDE.md`).

---

## 1. Problem & Vision

Modern QA work — test planning, ticket review, test-case design, automation, root-cause analysis,
test-data generation — is repetitive, context-heavy, and poorly served by ad-hoc AI prompting. The
10xDevs-3 course demonstrates a robust **agent orchestration pattern** (lean root config + a
`context/` system of record + a choreography of single-purpose skills + the CLI→agent discipline +
local quality hooks), but from an **application developer's** perspective.

**Vision:** bring that same orchestration discipline to the **QA / test-engineering process**, and
ship it as turnkey tooling for the two AI coding environments teams actually use — Claude Code and
GitHub Copilot — so a QA engineer runs one `npx` command and gets a working, opinionated testing
orchestration tailored to their stack.

The orchestration **logic is tool-agnostic; only the harness configuration changes per platform.**
That insight drives the whole product: one shared core, two thin platform packages.

This is, explicitly, **harness engineering for QA**: we don't ship a smarter model, we ship the
environment around the agent — a lean root "map", a `context/` system of record, single-purpose skills,
and the CLI→agent discipline. *The harness is the car, the model is the engine.* Two principles from the
state of the art steer the design: **"give the agent a map, not a thousand-page manual"** (knowledge as
a structured, just-in-time context tree, not one monolithic instructions file), and **"what's not in
context effectively doesn't exist"** (QA knowledge must be encoded as versioned repo artifacts, not left
in Jira/Slack/people's heads).

## 2. Goals / Non-goals

**Goals**
- Two independent npx packages with **functional parity**: `claude-qa-orchestrator`, `copilot-qa-orchestrator`.
- Scaffold a complete QA orchestration: context architecture + QA skill suite + guidelines + framework bootstrap.
- Deterministic, no-LLM **phase 1** installer; LLM-driven **phase 2** completion inside the tool.
- Detect the target repo's **test stack** (Playwright TS/JS, Playwright Java, RestAssured/JUnit/TestNG) and tailor output.
- Independent semantic versioning and release per package.
- Idempotent, non-destructive scaffolding (never overwrite; delete `context/`/configs to regenerate).

**Non-goals**
- Not an application-development scaffolder (that was the prior `claude-agent-scaffold` framing — superseded).
- Not a Copilot-config **auditor** — that remains the separate `vscode/auditskill` artifact.
- No runtime test execution or CI orchestration in MVP (the scaffolded skills assist; they don't replace the runner).
- No calls to the Anthropic API from the CLI; no `ANTHROPIC_API_KEY` usage in phase 1.

## 3. Personas

- **QA Engineer / SDET** — daily driver: reviews tickets, designs cases, writes/maintains Playwright & RestAssured tests, does RCA on failures.
- **Test Lead / Manager** — owns the test plan and strategy, cares about process consistency and repeatability across the team.
- **Mixed team** — some on Claude Code, some on Copilot in VS Code; the team wants the *same* process regardless of tool.

## 4. The two packages

| | `claude-qa-orchestrator` | `copilot-qa-orchestrator` |
|---|---|---|
| Target | Claude Code (CLI) | GitHub Copilot in VS Code |
| Phase-2 surface | `.claude/skills/<name>/SKILL.md` | `.github/prompts/*.prompt.md` + `.github/agents/qa-orchestrator.agent.md` |
| Root config | `CLAUDE.md` | `.github/copilot-instructions.md` |
| Quality hooks | `.claude/settings.json` (PostToolUse) | documented manual gates / instructions |
| Versioning | independent | independent |

Both write the **same** `context/` system of record and the **same logical QA skill suite** — only
paths and frontmatter differ. Functional parity is a hard requirement and is verified by snapshot tests.

## 5. Capabilities (MVP)

All four capability buckets ship in Milestone 1. Each capability is a single-purpose skill whose
*procedure* lives in the shared core and is rendered to each platform.

**A. Backbone — context + test-process management**
- `qa-init` — bootstrap `context/` + lean root config for the chosen platform.
- `qa-new` / `qa-plan` / `qa-implement` / `qa-review` / `qa-archive` — change-driven workflow for a unit of test work (a "work-item"), adapted from the 10xDevs new→plan→implement→review→archive loop.

**B. Test design**
- `qa-ticket-review` — analyze a ticket/requirement for testability, acceptance criteria, and risks.
- `qa-test-plan` — create/update `context/foundation/test-plan.md`.
- `qa-test-case-design` — generate structured test cases into `context/changes/<id>/cases.md`.

**C. Automation**
- `qa-automation-bootstrapper` — detect + set up the test framework (Playwright TS/Java, RestAssured/JUnit).
- `qa-test-automate` — author/maintain automated tests in the detected framework.
- `qa-playwright-cli` — drive the Playwright CLI (`codegen`, `show-report`, `show-trace`, `--ui`, `--update-snapshots`) to support authoring and RCA on Playwright stacks (shipped R-024).
- `qa-ci-pipeline` — generate or audit a CI pipeline (GitHub Actions / GitLab CI / Azure Pipelines) that runs the chosen framework and publishes results into the report dirs wired into the result MCP, closing the test → report → legibility loop at the CI boundary (shipped R-027).

**D. Analysis & data**
- `qa-rca` — root-cause analysis of failed runs / bugs.
- `qa-test-data-gen` — generate test data as reusable, schema-valid **factories/fixtures** (not inline literals), with stack-aware tooling and boundary/invalid variants as overrides (richer generation shipped R-010).
- `qa-gardening` — recurring, read-only sweep for QA drift/slop across `context/` + tests; proposes targeted fixes, never edits (shipped R-004; see §8).
- `qa-bug-report` — turn a confirmed product defect into a structured, reproducible report with evidence (shipped R-018).
- `qa-reverse-engineer` — reverse-engineer the application source into structured project docs under `context/reference/` (business, architecture, data flow, integrations, entry points, test surface; shipped R-019).
- `qa-coverage-gap` — read-only AC ↔ case ↔ test traceability map; reports uncovered/partial criteria and orphan cases/tests (shipped R-022; see §9 success metrics).
- `qa-metrics` — read-only QA observability digest: aggregates pass/fail/flakiness (incl. cross-run Allure history) and acceptance-criterion coverage across `context/` into a dashboard in the report language (shipped R-012; see §8).

This is **20 skills** in total. Each carries a **suggested model tier** (`opus`/`sonnet`/`haiku`) matched to its cognitive load, and a `## Next` section recommending downstream skills so the agent-orchestration graph lives in the suite itself — the full skill × model × tooling matrix is in **TECH.md §5**.

## 6. Supported test stacks (MVP)

- **Playwright (TS/JS)** — `@playwright/test`, `playwright.config.*`.
- **Playwright (Java)** — `com.microsoft.playwright` (Maven/Gradle).
- **RestAssured (Java)** — `io.rest-assured` (Maven/Gradle), with JUnit 5 / TestNG runner detection.
- **pytest (Python)** — `pyproject.toml` / `requirements.txt` / `setup.py` (pip or Poetry), with a `pytest-results` MCP server over `./reports` + `./test-results`.

Polyglot repos are detected fully; one primary stack is chosen by priority and used to seed wizard defaults.

Roadmap stacks (post-MVP): additional automation stacks as demand emerges.

## 7. User journeys

**Setup (phase 1 → phase 2)**
1. QA runs `npx claude-qa-orchestrator init` (or the Copilot package) in the target repo.
2. The installer detects the test stack and runs a short wizard (`--yes` accepts detected defaults for CI).
3. It writes `context/`, guidelines, and the platform skill/prompt files with `{{PLACEHOLDER}}` markers — **no LLM, deterministic**.
4. Inside the tool (Claude Code or Copilot), the QA runs the phase-2 skill/prompt; it interviews them and fills the placeholders into finished skills.

**Daily work-item flow (after setup)**
`qa-ticket-review` → `qa-test-plan` → `qa-test-case-design` → `qa-automation-bootstrapper` (first time) → `qa-test-automate` → run → `qa-rca` (on failure) → `qa-review` → `qa-archive`. Each step reads/writes the shared `context/`.

## 8. Milestones & roadmap

> Live status, item IDs (`R-###`), and the files each change lands in are tracked in **[`ROADMAP.md`](ROADMAP.md)**.

- **M0 — Monorepo & core extraction.** npm workspaces; move `cli/` → `packages/`, extract agnostic modules to `packages/core`; existing tests stay green; remove empty `claude/`, `mcp/`.
- **M1 — Core for the QA domain.** Extend detection (Playwright TS/Java, RestAssured); reframe wizard/labels for QA; add `core/model` (logical QA skills) + `PlatformAdapter`; `context/` + guideline templates.
- **M2 — `claude-qa-orchestrator`.** Claude adapter + `SKILL.md` templates (`allowed-tools`) + hooks; phase-1 CLI emits `.claude/` + `context/`; phase-2 skill fills placeholders. Snapshot tests.
- **M3 — `copilot-qa-orchestrator` (parity).** Copilot adapter + `.github/{copilot-instructions,instructions,prompts,agents,chatmodes}` + `.vscode/mcp.json`; phase-2 as `.agent.md`/`.prompt.md`. Parity snapshot tests.
- **M4 — Docs & release.** Final PRD/TECH, per-package README, independent versioning, npx smoke tests for both.

**Roadmap (post-MVP):** ~~richer test-data generation (faker/factories/mocks)~~ ✅ shipped (R-010, v0.11.0); ~~a coverage-gap skill~~ ✅ shipped (R-022, v0.10.0); ~~a metrics-dashboard + observability skill~~ ✅ shipped (R-012, v0.12.0 — `qa-metrics` + Allure cross-run history wiring); ~~Playwright MCP/CLI tooling~~ ✅ shipped (R-023/R-024, v0.13.0–v0.14.0); a Mermaid diagram standard (✅ shipped R-025, v0.15.0) + the guideline-standard upgrade (mandatory good/bad examples + suggested patterns — ✅ shipped R-026, v0.16.0); a `qa-ci-pipeline` skill (✅ shipped R-027, v0.17.0); a `documentation-as-code` guideline with `doctor` enforcement (✅ shipped R-028, v0.18.0); a grounding / anti-hallucination rule + guideline with `doctor` enforcement (✅ shipped R-029, v0.19.0); a `spec-driven-development` guideline — spec/acceptance-criteria precede case design, automation, and code (✅ shipped R-030, v0.20.0). See **[`ROADMAP.md`](ROADMAP.md)** for the tracked backlog.

Harness-engineering roadmap items (grounded in OpenAI's Codex report — see TECH.md §11):
- **`doctor`** — ✅ **shipped (v0.2.0).** A deterministic validator (`npx <pkg> doctor`) that checks structure, the handoff manifest, leftover phase-1 placeholders, broken relative links, and the iron QA rule **outside the agent loop**; findings carry remediation, exits non-zero on errors (CI-friendly).
- **`qa-gardening` skill** — ✅ **shipped (v0.4.0).** A recurring, read-only "docs/test-debt cleanup" pass that folds in `doctor` findings, scans `context/` + tests for drift and stale artifacts, and proposes targeted fixes grouped by severity (entropy / garbage-collection of "QA slop"). Read-only: it reports and hands each fix to the right write skill, it never edits.
- **Result legibility via MCP** — ✅ **shipped (v0.3.0, extended through v0.6.0).** Phase 1 wires a read-only filesystem MCP server into `.mcp.json` / `.vscode/mcp.json` over each stack's result artifacts, so `qa-rca` / `qa-test-automate` read outcomes directly (the QA analog of Codex's Chrome DevTools + observability wiring): `playwright-results` (HTML report + traces), `pytest-results` (`./reports` + `./test-results`, v0.5.0), and `jvm-results` (Surefire/Serenity or Gradle test reports for RestAssured/JUnit/TestNG, v0.6.0). **Extended in v0.12.0 (R-012):** when **Allure** is detected, its durable cross-run history (`allure-report/history`) + results dirs are added to the result server, so legibility reaches past a single static report directory — and the read-only `qa-metrics` skill aggregates pass/fail/flakiness + criterion-coverage into a digest.
- **Ticketing via MCP** — ✅ **shipped (v0.7.0).** An opt-in (default off, CI-safe) phase-1 wizard question wires a local, custom-built `atlassian` MCP server (Jira + Confluence) so `qa-ticket-review` reads tickets and linked specs directly. Secrets are never written into the repo: the launch path and credentials are `${VAR}` indirections supplied via the environment, rendered in each platform's interpolation syntax (`${VAR}` for Claude, `${env:VAR}` for VS Code).
- **Playwright browser MCP** — ✅ **shipped (v0.13.0, R-023).** An opt-in (default off, CI-safe) wizard question wires the official `@playwright/mcp` **browser** server so `qa-test-case-design` and `qa-rca` can interactively explore the live UI (navigate, snapshot, inspect) — distinct from `playwright-results`, which only reads static report artifacts. No secrets; renders identically on both platforms.
- **Grounding / anti-hallucination** — ✅ **shipped (v0.19.0, R-029).** A second load-bearing rule in the lean root config (next to the iron QA rule, so it survives compaction) plus a `grounding` guideline: every claim cites a real artifact (`file:line` / ticket id / result-MCP output), nothing is invented, and uncertainty is flagged. The claim-producing skills reference it; `doctor` enforces both its root-config presence (`GROUNDING:missing`) and the guideline's contract (`GROUNDING:contract`). This makes result legibility *honest* — the agent reads the artifact instead of recalling a plausible value.
- **Spec-driven development** — ✅ **shipped (v0.20.0, R-030).** A `spec-driven-development` guideline codifies the spec-first flow: a documented spec (acceptance criteria, expected behavior, edge conditions) precedes case design, automation, and code, and every case derives from — traces to — the spec. It is the iron QA rule read from the *authoring* direction (the criterion must exist *first*, so there is something to trace to). The authoring-chain skills (`qa-ticket-review`, `qa-test-case-design`, `qa-test-automate`) reference it; `doctor` expects the guideline and its ✅/❌ examples. Composes with grounding and reinforces the iron QA rule.
- **`tech-debt-tracker.md`** in `context/foundation/` — a versioned, agent-readable backlog of test debt, known flaky areas, and RCA history.

## 9. Success metrics

- Time from ticket to a reviewed set of test cases (qualitative, target: minutes not hours).
- % of new behavior shipped with automated tests in the detected framework (the iron QA rule, carried over).
- Repeatability: deterministic work-item / finding IDs so re-runs are stable.
- Parity: 100% of MVP skills present in both packages (enforced by snapshot tests).

## 10. Risks & mitigations

- **Parity drift** between the two packages → single shared core + snapshot tests asserting identical skill sets and `context/` trees.
- **Template volume** for full QA suite → keep skill *procedure* in core/model once; adapters only re-wrap paths/frontmatter.
- **Platform model mismatch** (Claude skills vs Copilot prompts/agents) → explicit `PlatformAdapter` interface and a documented mapping table (see TECH.md).
- **Scope creep** (full suite as MVP) → strict milestone build order (M0→M4); roadmap items stay out of MVP.
- **Non-destructive expectation** → skip-if-exists everywhere; regeneration requires explicit deletion.

---

See **TECH.md** for architecture, module contracts, the platform mapping table, build/release, and testing strategy.
