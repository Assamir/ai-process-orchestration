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
| 0.4.0 | **R-004** `gardening` skill — recurring read-only QA drift/slop sweep over `context/` + tests; proposes targeted fixes, never edits | `78c7d90` | `packages/core/src/model/skills.ts`, `tests/scaffold.test.ts` |
| 0.4.1 | **R-005** `tech-debt-tracker.md` foundation doc — first-class versioned test-debt backlog; `qa-archive` appends, `gardening` scans, `doctor` checks it exists | `62bbecf` | `packages/core/src/model/context.ts`, `model/skills.ts` (`qa-archive`, `gardening`) |
| 0.5.0 | **R-006** pytest as a first-class stack — wizard default + QA advice (already in `labels.ts`) plus a `pytest-results` MCP server over `./reports` + `./test-results` | _pending_ | `packages/core/src/model/mcp.ts`, `detect/python.ts`, `types.ts`, `model/skills.ts` (`automation-bootstrapper`), `tests/` |

PRD capabilities §5 and the harness-engineering roadmap in PRD §8 / TECH §11 track these at the product level.

## Next (planned)

_All currently scheduled items are shipped. The next stack/feature work lives in the backlog below._

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
