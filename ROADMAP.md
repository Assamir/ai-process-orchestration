# ROADMAP — QA Process Orchestration

> Single source of truth for **what we build next and how we track it**. Each item names where it
> lands (files), its acceptance criteria, and the artifact it traces to. Update this file in the same
> PR/commit that ships the change.
>
> Linked artifacts: [`PRD.md`](PRD.md) (product) · [`TECH.md`](TECH.md) (architecture, esp. §11
> harness-engineering) · [`CLAUDE.md`](CLAUDE.md) (working guide) · packages
> [`core`](packages/core) · [`claude-qa-orchestrator`](packages/claude-qa-orchestrator) ·
> [`copilot-qa-orchestrator`](packages/copilot-qa-orchestrator) · reference
> [`knowledge-markdowns/10xdevs-3`](knowledge-markdowns/10xdevs-3).

## How to use this file

- **Status legend:** `✅ shipped` · `🚧 in progress` · `⬜ planned` · `🧊 backlog (unscheduled)`.
- Every roadmap item has a stable **ID** (`R-###`). Reference it in commits (`feat(R-004): …`) and tests.
- A change is *done* when: code + tests (incl. the parity test) pass, this file flips the item to ✅
  with the version + commit, and the linked PRD/TECH section is updated.
- The shared **`@qa-orch/core`** holds all platform-agnostic logic; both packages must stay at **parity**
  (enforced by `packages/core/tests/scaffold.test.ts`). New skills/MCP wiring land in `core`, never in a leaf.
- Releases are **per package, independently versioned** (`packages/*/package.json`); `core` is private and
  bundled. Bump on each shipped item.

## Shipped

| Ver | Item | Key commit | Landed in |
|-----|------|-----------|-----------|
| 0.1.0 | **R-001** Monorepo + twin npx packages (core + Claude/Copilot), two-phase scaffolder, 13-skill QA suite, `context/` system of record | `e27cb05` | `packages/*`, root `package.json` |
| 0.2.0 | **R-002** `doctor` — deterministic scaffold validator (structure, manifest, placeholders, links, iron QA rule) | `4809161` | `packages/core/src/doctor/index.ts`, `cli.ts` |
| 0.3.0 | **R-003** MCP result-legibility — `playwright-results` filesystem server wired into `.mcp.json` / `.vscode/mcp.json` | `20999c9` | `packages/core/src/model/mcp.ts`, adapters |

PRD capabilities §5 and the harness-engineering roadmap in PRD §8 / TECH §11 track these at the product level.

## Next (planned)

### ⬜ R-004 — `gardening` skill (maintenance loop) → target v0.4.0
- **What:** a recurring, read-only "QA slop / drift" review that scans the scaffolded `context/` + tests
  for staleness and inconsistency and proposes targeted fixes (does not auto-edit).
- **Why:** OpenAI Codex "entropy & garbage-collection" + "golden rules" (see TECH §11; PRD §8 roadmap).
- **Lands in:** `packages/core/src/model/skills.ts` (new `LogicalSkill`, bucket `analysis`, `readOnly: true`);
  rendered by both adapters automatically. Optionally reuse `doctor` findings.
- **Acceptance:** skill present for both platforms (parity test sees it); read-only tool allowlist; no
  weakening of the iron QA rule; `docs` updated; bump 0.4.0.
- **Traces to:** TECH §11 "Entropy / garbage-collection"; PRD §8.

### ⬜ R-005 — `tech-debt-tracker.md` foundation doc → target v0.4.0
- **What:** add `context/foundation/tech-debt-tracker.md` to the scaffold; `qa-archive` appends test debt /
  known flaky areas; `doctor` checks it exists.
- **Why:** Codex "plans as first-class artifacts" / versioned debt backlog (TECH §6, §11).
- **Lands in:** `packages/core/src/model/context.ts` (`FOUNDATION`), `model/skills.ts` (`qa-archive` body),
  `packages/core/src/doctor/index.ts` (expected-files list).
- **Acceptance:** new foundation file scaffolded both platforms; doctor green on fresh scaffold; parity holds.
- **Traces to:** TECH §6 (system of record), §11.

### ⬜ R-006 — pytest as a first-class stack → target v0.5.0
- **What:** promote pytest from "detected" to fully supported: wizard default, QA advice, and an MCP results
  server (e.g. over `./reports` / `junit.xml` / `pytest-html`).
- **Lands in:** `detect/python.ts` (already detects), `labels.ts` (already has advice — verify choices),
  `model/mcp.ts` (`resultServers` case for `pytest`), `tests/` (detect + mcp).
- **Acceptance:** scaffolding a pytest repo seeds the right framework + MCP results server; tests cover it.
- **Traces to:** PRD §6 "Roadmap stacks".

### ⬜ R-007 — Cypress stack → target v0.6.0
- **What:** detect Cypress (`cypress` dep / `cypress.config.*`), add framework + QA advice + MCP results
  (`./cypress/reports`, `./cypress/videos`, `./cypress/screenshots`).
- **Lands in:** `detect/node.ts`, `types.ts` (add `cypress` to `AutomationFramework`), `labels.ts`,
  `model/mcp.ts`, `tests/`.
- **Acceptance:** Cypress repo detected + scaffolded with results wiring; parity + detect tests.
- **Traces to:** PRD §6 "Roadmap stacks".

## Backlog (unscheduled)

- **🧊 R-008 — MCP results for RestAssured/JUnit/TestNG.** Extend `resultServers` to wire Surefire/Serenity
  report dirs for JVM stacks. Lands: `model/mcp.ts`, `tests/`. Traces: TECH §11.
- **🧊 R-009 — Ticketing (Jira) via MCP.** Optional MCP server so `ticket-review` reads tickets directly.
  Needs config/secrets handling. Lands: `model/mcp.ts`, `ticket-review` body. Traces: PRD §8.
- **🧊 R-010 — Richer test-data generation.** Faker/factories/mocks support in `test-data-gen`. Lands:
  `model/skills.ts`, possibly a helper. Traces: PRD §8.
- **🧊 R-011 — k6 / performance testing.** New stack + skill. Lands: `detect/*`, `model/skills.ts`. Traces: PRD §8.
- **🧊 R-012 — Metrics dashboard skill.** Summarize coverage/flakiness from `context/` + results. Lands:
  `model/skills.ts`. Traces: PRD §8 success metrics.

## Conventions for tracking

- One PR/commit per `R-###` where practical; commit subject `type(R-###): summary`.
- On ship: flip status to ✅, add a row to **Shipped** with version + commit, bump the package version(s),
  and update the linked PRD/TECH section. Keep `gardening` itself honest — run `doctor` before shipping.
- Keep this list pruned: move stale ideas to backlog, delete dead ones.
