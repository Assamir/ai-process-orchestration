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
- `ticket-review` — analyze a ticket/requirement for testability, acceptance criteria, and risks.
- `test-plan` — create/update `context/foundation/test-plan.md`.
- `test-case-design` — generate structured test cases into `context/changes/<id>/cases.md`.

**C. Automation**
- `automation-bootstrapper` — detect + set up the test framework (Playwright TS/Java, RestAssured/JUnit).
- `test-automate` — author/maintain automated tests in the detected framework.

**D. Analysis & data**
- `rca` — root-cause analysis of failed runs / bugs.
- `test-data-gen` — generate test data.

## 6. Supported test stacks (MVP)

- **Playwright (TS/JS)** — `@playwright/test`, `playwright.config.*`.
- **Playwright (Java)** — `com.microsoft.playwright` (Maven/Gradle).
- **RestAssured (Java)** — `io.rest-assured` (Maven/Gradle), with JUnit 5 / TestNG runner detection.

Polyglot repos are detected fully; one primary stack is chosen by priority and used to seed wizard defaults.

Roadmap stacks (post-MVP): pytest, Cypress, k6, and others.

## 7. User journeys

**Setup (phase 1 → phase 2)**
1. QA runs `npx claude-qa-orchestrator init` (or the Copilot package) in the target repo.
2. The installer detects the test stack and runs a short wizard (`--yes` accepts detected defaults for CI).
3. It writes `context/`, guidelines, and the platform skill/prompt files with `{{PLACEHOLDER}}` markers — **no LLM, deterministic**.
4. Inside the tool (Claude Code or Copilot), the QA runs the phase-2 skill/prompt; it interviews them and fills the placeholders into finished skills.

**Daily work-item flow (after setup)**
`ticket-review` → `test-plan` → `test-case-design` → `automation-bootstrapper` (first time) → `test-automate` → run → `rca` (on failure) → `qa-review` → `qa-archive`. Each step reads/writes the shared `context/`.

## 8. Milestones & roadmap

- **M0 — Monorepo & core extraction.** npm workspaces; move `cli/` → `packages/`, extract agnostic modules to `packages/core`; existing tests stay green; remove empty `claude/`, `mcp/`.
- **M1 — Core for the QA domain.** Extend detection (Playwright TS/Java, RestAssured); reframe wizard/labels for QA; add `core/model` (logical QA skills) + `PlatformAdapter`; `context/` + guideline templates.
- **M2 — `claude-qa-orchestrator`.** Claude adapter + `SKILL.md` templates (`allowed-tools`) + hooks; phase-1 CLI emits `.claude/` + `context/`; phase-2 skill fills placeholders. Snapshot tests.
- **M3 — `copilot-qa-orchestrator` (parity).** Copilot adapter + `.github/{copilot-instructions,instructions,prompts,agents,chatmodes}` + `.vscode/mcp.json`; phase-2 as `.agent.md`/`.prompt.md`. Parity snapshot tests.
- **M4 — Docs & release.** Final PRD/TECH, per-package README, independent versioning, npx smoke tests for both.

**Roadmap (post-MVP):** pytest & Cypress stacks; ticketing integrations (e.g. Jira) via MCP; richer test-data generation (faker/factories/mocks); k6 / performance; a metrics dashboard skill.

Harness-engineering roadmap items (grounded in OpenAI's Codex report — see TECH.md §11):
- **`doctor`** — ✅ **shipped (v0.2.0).** A deterministic validator (`npx <pkg> doctor`) that checks structure, the handoff manifest, leftover phase-1 placeholders, broken relative links, and the iron QA rule **outside the agent loop**; findings carry remediation, exits non-zero on errors (CI-friendly).
- **`gardening` skill** — a recurring "docs/test-debt cleanup" pass that scans for drift and stale artifacts and proposes targeted fixes (entropy / garbage-collection of "QA slop").
- **Result legibility via MCP** — `automation-bootstrapper` wires `.mcp.json` / `.vscode/mcp.json` entries for Playwright HTML reports, traces, and run logs so `rca` / `test-automate` read outcomes directly (the QA analog of Codex's Chrome DevTools + observability wiring).
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
