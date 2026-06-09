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
| 0.1.0 | **R-001** Monorepo + twin npx packages (core + Claude/Copilot), two-phase scaffolder, 13-skill QA suite (→ **14** after R-004 added `qa-gardening`), `context/` system of record | `e27cb05` | `packages/*`, root `package.json` |
| 0.2.0 | **R-002** `doctor` — deterministic scaffold validator (structure, manifest, placeholders, links, iron QA rule) | `4809161` | `packages/core/src/doctor/index.ts`, `cli.ts` |
| 0.3.0 | **R-003** MCP result-legibility — `playwright-results` filesystem server wired into `.mcp.json` / `.vscode/mcp.json` | `20999c9` | `packages/core/src/model/mcp.ts`, adapters |
| 0.4.0 | **R-004** `qa-gardening` skill — recurring read-only QA drift/slop sweep over `context/` + tests; proposes targeted fixes, never edits | `78c7d90` | `packages/core/src/model/skills.ts`, `tests/scaffold.test.ts` |
| 0.4.1 | **R-005** `tech-debt-tracker.md` foundation doc — first-class versioned test-debt backlog; `qa-archive` appends, `qa-gardening` scans, `doctor` checks it exists | `62bbecf` | `packages/core/src/model/context.ts`, `model/skills.ts` (`qa-archive`, `qa-gardening`) |
| 0.5.0 | **R-006** pytest as a first-class stack — wizard default + QA advice (already in `labels.ts`) plus a `pytest-results` MCP server over `./reports` + `./test-results` | `e005b73` | `packages/core/src/model/mcp.ts`, `detect/python.ts`, `types.ts`, `model/skills.ts` (`qa-automation-bootstrapper`), `tests/` |
| 0.6.0 | **R-008** MCP results for JVM stacks — `jvm-results` server over Surefire/Serenity report dirs (Maven) or Gradle test/serenity reports for RestAssured/JUnit5/TestNG | `b7df77b` | `packages/core/src/model/mcp.ts`, `model/skills.ts` (`qa-automation-bootstrapper`), `tests/mcp.test.ts` |
| 0.7.0 | **R-009** Ticketing via MCP — opt-in local custom `atlassian` (Jira + Confluence) server with env-var-indirected secrets; `qa-ticket-review` reads tickets/specs directly; platform-correct `${VAR}`/`${env:VAR}` rendering | `3bd6857` | `model/mcp.ts`, `types.ts`, `wizard/index.ts`, `scaffold/index.ts`, `adapters/*`, `model/skills.ts` (`qa-ticket-review`), `tests/mcp.test.ts` |
| 0.8.0 | **R-013** Docs reconciliation — 14-skill suite (`qa-gardening` added to PRD §5), R-007 ID gap documented as reserved, TECH §6 foundation list + §11 `qa-gardening`/iron-rule corrected | `abb592d` | `ROADMAP.md`, `PRD.md`, `TECH.md` |
| 0.8.0 | **R-014** Skill × model × tooling matrix — `suggestedModel` on `LogicalSkill`, rendered as Claude `SKILL.md` `model:` frontmatter (doc-only on Copilot); matrix in TECH §5 | `abb592d` | `model/skills.ts`, `adapters/claude.ts`, `tests/scaffold.test.ts`, `TECH.md` |
| 0.8.0 | **R-015** Scaffolded-guidelines standard + two-phase/daily-loop flow reference (TECH §12) | `abb592d` | `TECH.md`, `ROADMAP.md` |
| 0.8.0 | **R-017** Uniform `qa-` prefix on every skill — all 14 are `qa-<name>`; renamed 8 skills + every cross-reference (bodies, root config, orchestrator, wizard, comments, tests, docs) | `abb592d` | `model/skills.ts`, `model/context.ts`, `adapters/copilot.ts`, `model/mcp.ts`, `types.ts`, `wizard/index.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.9.0 | **R-018** `qa-bug-report` skill — structured, reproducible defect report (seeded template, evidence via result MCP, traced AC); closes the `qa-rca` → bug-report gap | `(pending)` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.9.0 | **R-019** `qa-reverse-engineer` skill + `context/reference/` — reverse-engineers app source into structured project docs (business, architecture, data flow, integrations, entry points, test surface); proposes a split for monoliths first | `(pending)` | `model/skills.ts`, `model/context.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.9.0 | **R-020** `## Next` suggested-flow sections across all 16 skills — agent-orchestration graph encoded in the suite itself | `(pending)` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md` |
| 0.9.0 | **R-021** Sharpened `qa-gardening` description + boundary vs `doctor` (semantic in-loop sweep vs deterministic out-of-loop validator); no behavior change | `(pending)` | `model/skills.ts` |

PRD capabilities §5 and the harness-engineering roadmap in PRD §8 / TECH §11 track these at the product level.

> **ID note — R-007 was never used.** The sequence jumps R-006 → R-008; no commit or doc references
> `R-007` (verified). IDs are **append-only and never reused**, so `R-007` stays a permanent gap
> (reserved/skipped), not a slot to fill. The current shipped suite is **16 skills** (the 13 of R-001,
> `qa-gardening` from R-004, and `qa-bug-report` + `qa-reverse-engineer` from R-018/R-019); see the
> skill × model × tooling matrix in TECH §5.

## Next (planned)

_All scheduled items are shipped: R-013/R-014/R-015/R-017 in **v0.8.0**, and R-018/R-019/R-020/R-021
(two new skills, `## Next` orchestration, `qa-gardening` sharpening) in **v0.9.0**. The next
stack/feature work lives in the backlog below._

## Backlog (unscheduled)

- **🧊 R-010 — Richer test-data generation.** Faker/factories/mocks support in `qa-test-data-gen`. Lands:
  `model/skills.ts`, possibly a helper. **Done when:** `qa-test-data-gen` can emit reusable
  factories/fixtures (not just inline values) for the detected stack, schema-validated, with a test
  proving the generated form is referenced from cases. Traces: PRD §8.
- **🧊 R-011 — k6 / performance testing.** New stack + skill. Lands: `detect/*`, `types.ts`,
  `model/skills.ts`, `model/mcp.ts`. **Done when:** k6 is a detected framework with wizard defaults, a
  perf-oriented skill exists, and a `k6-results` MCP server is wired over its output dir; parity test
  green. Traces: PRD §6 (post-MVP stacks), §8.
- **🧊 R-012 — Metrics dashboard skill.** Summarize coverage/flakiness from `context/` + results. Lands:
  `model/skills.ts`. **Done when:** a read-only skill aggregates pass/fail/flake + criterion-coverage
  from the result MCP servers and `context/`, emitting a digest in the report language. Traces: PRD §9
  success metrics.
- **🧊 R-016 — Richer observability beyond filesystem reports.** Extend result legibility past static
  report dirs (e.g. live run streaming / cloud test observability). Lands: `model/mcp.ts`, `detect/*`.
  Traces: PRD §8 ("Richer observability … remains on the roadmap"), TECH §11.

## Conventions for tracking

- One PR/commit per `R-###` where practical; commit subject `type(R-###): summary`.
- On ship: flip status to ✅, add a row to **Shipped** with version + commit, bump the package version(s),
  and update the linked PRD/TECH section. Keep `qa-gardening` itself honest — run `doctor` before shipping.
- Keep this list pruned: move stale ideas to backlog, delete dead ones.
