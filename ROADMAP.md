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
| 0.9.0 | **R-018** `qa-bug-report` skill — structured, reproducible defect report (seeded template, evidence via result MCP, traced AC); closes the `qa-rca` → bug-report gap | `0883c46` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.9.0 | **R-019** `qa-reverse-engineer` skill + `context/reference/` — reverse-engineers app source into structured project docs (business, architecture, data flow, integrations, entry points, test surface); proposes a split for monoliths first | `0883c46` | `model/skills.ts`, `model/context.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.9.0 | **R-020** `## Next` suggested-flow sections across all 16 skills — agent-orchestration graph encoded in the suite itself | `0883c46` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md` |
| 0.9.0 | **R-021** Sharpened `qa-gardening` description + boundary vs `doctor` (semantic in-loop sweep vs deterministic out-of-loop validator); no behavior change | `0883c46` | `model/skills.ts` |
| 0.10.0 | **R-022** `qa-coverage-gap` skill (read-only) — maps acceptance criteria ↔ cases ↔ automated tests, classifies each criterion covered/partial/uncovered, flags orphan cases/tests; emits a traceability report, wired into `qa-review` / `qa-test-case-design` `## Next` | `ffa4330` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.11.0 | **R-010** Richer test-data generation — `qa-test-data-gen` now emits reusable, schema-valid **factories/fixtures** (not inline literals) with stack-aware tooling (`@faker-js/faker`, `factory_boy`, `datafaker`/`instancio`), boundary/invalid variants as overrides, each referenced by name from `cases.md` for traceability | `96d1df0` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md` |
| 0.12.0 | **R-012** Metrics dashboard + observability — read-only `qa-metrics` skill aggregates pass/fail/flakiness + acceptance-criterion coverage across `context/` and runs into a digest; result-legibility extended past static report dirs by detecting **Allure** (`DetectedStack.observability`) and wiring its `allure-results`/`allure-report` (durable cross-run history) into the result MCP server | `f20c580` | `model/skills.ts`, `model/mcp.ts`, `detect/*`, `types.ts`, `scaffold/index.ts`, `tests/*`, `PRD.md`, `TECH.md`, READMEs |
| 0.13.0 | **R-023** Playwright browser MCP wiring — opt-in (default off, CI-safe) wizard question wires the official `@playwright/mcp` browser server for interactive exploration in `qa-test-case-design` / `qa-rca`; both adapters render it (platform-correct envelope), `qa-rca`/`qa-test-case-design` bodies reference it | `a12684d` | `model/mcp.ts`, `types.ts`, `wizard/index.ts`, `scaffold/index.ts`, `model/skills.ts`, `index.ts`, `tests/mcp.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.14.0 | **R-024** `qa-playwright-cli` skill (write/automation) — wraps the Playwright CLI (`codegen`, `show-report`, `show-trace`, `--ui`, `--update-snapshots`) to support `qa-test-automate` / `qa-rca`; renders with the write tool allowlist on both platforms, references the opt-in browser MCP | `b7ea605` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md`, `TECH.md`, READMEs |
| 0.15.0 | **R-025** Mermaid diagram standard — new `diagram-conventions` guideline (diagram-type → use mapping, fencing/labeling/size rules, an example flowchart, a `{{PROJECT_DIAGRAMS}}` phase-2 slot); ships on both platforms via `GUIDELINES`, `doctor` expects it; TECH §12.2 documents the standard | `6d0438b` | `model/context.ts` (`GUIDELINES`), `tests/scaffold.test.ts`, `TECH.md` §12, `PRD.md` |
| 0.16.0 | **R-026** Guideline-standard upgrade — every guideline now carries a mandatory `## Examples (✅ good / ❌ bad)` section + an encouraged `## Applicable patterns` section (phase-2 `*_PATTERNS` slots); `doctor` enforces the good/bad examples (`GUIDELINE:examples:<name>`, error); TECH §12.1 documents the rule | `8851a91` | `model/context.ts` (`GUIDELINES`), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §12.1 |
| 0.17.0 | **R-027** `qa-ci-pipeline` skill (write) — generates or audits a CI pipeline (GitHub Actions / GitLab CI / Azure Pipelines) that runs `{{AUTOMATION_FRAMEWORK}}`, fails on test failure, and publishes the result dirs wired into the result MCP (Playwright/pytest/Surefire-Serenity/Allure); wired from `qa-test-automate` + `qa-automation-bootstrapper` `## Next`; closes the test → report → legibility loop at the CI boundary | `72ea232` | `model/skills.ts`, `tests/scaffold.test.ts`, `PRD.md` §5, `TECH.md` §5, `ROADMAP.md` |

PRD capabilities §5 and the harness-engineering roadmap in PRD §8 / TECH §11 track these at the product level.

> **ID note — R-007 was never used.** The sequence jumps R-006 → R-008; no commit or doc references
> `R-007` (verified). IDs are **append-only and never reused**, so `R-007` stays a permanent gap
> (reserved/skipped), not a slot to fill. The current shipped suite is **20 skills** (the 13 of R-001,
> `qa-gardening` from R-004, `qa-bug-report` + `qa-reverse-engineer` from R-018/R-019,
> `qa-coverage-gap` from R-022, `qa-metrics` from R-012, `qa-playwright-cli` from R-024, and
> `qa-ci-pipeline` from R-027); see the skill × model × tooling matrix in TECH §5.

## Next (planned)

_All scheduled items are shipped: R-013/R-014/R-015/R-017 in **v0.8.0**, R-018/R-019/R-020/R-021
(two new skills, `## Next` orchestration, `qa-gardening` sharpening) in **v0.9.0**, R-022
(`qa-coverage-gap`) in **v0.10.0**, R-010 (richer test-data factories) in **v0.11.0**, R-012
(`qa-metrics` + Allure observability) in **v0.12.0**, R-023 (Playwright browser MCP) in **v0.13.0**, and
R-024 (`qa-playwright-cli`) in **v0.14.0**, R-025 (Mermaid diagram standard) in **v0.15.0**, and R-026
(guideline-standard upgrade — mandatory ✅/❌ examples) in **v0.16.0**, and R-027 (`qa-ci-pipeline` skill)
in **v0.17.0**. The next stack/feature work lives in the backlog below._

## Backlog (unscheduled)

- **🧊 R-028 — Documentation-as-Code guideline + `doctor` enforcement.** A first-class
  `documentation-as-code` guideline codifying what the product already embodies: docs live in-repo,
  are versioned, reviewed in PR, validated deterministically by `doctor`, and kept in sync with code
  via CI (ties to R-027). Lands: `model/context.ts` (`GUIDELINES`), `doctor/index.ts`, TECH §12.
  **Done when:** the guideline ships on both platforms via `GUIDELINES`, `doctor` expects it, parity
  green. Traces: TECH §11, §12.

- **🧊 R-029 — Anti-Hallucination (grounding) rule.** A load-bearing rule in the lean root config (so
  it survives compaction) plus a guideline: every skill grounds claims in real artifacts (file:line,
  ticket IDs, result-MCP output), cites its sources, and explicitly flags uncertainty instead of
  inventing facts/paths/APIs. Lands: `model/context.ts` (root config + `GUIDELINES`),
  `model/skills.ts` (procedure preambles), `doctor/index.ts`, TECH §11. **Done when:** the rule is in
  the root config and a guideline, referenced by skill procedures, and `doctor` checks its presence;
  parity green. Traces: TECH §11 (harness engineering).

- **🧊 R-030 — Documentation-Driven / Spec-Driven Development guideline.** Codify spec-first flow: a
  documented spec / acceptance criteria precede case design, automation and code; every test traces
  back to the spec (extends the iron QA rule from the authoring direction). Lands:
  `model/context.ts` (`GUIDELINES`), `model/skills.ts` (`## Next` wiring, e.g. `qa-ticket-review` →
  `qa-test-case-design`), TECH §12. **Done when:** the guideline ships on both platforms, the skill
  flow references it, parity green. Traces: PRD §5, TECH §11/§12.

- **🧊 R-031 — Auto-fix broken relative links (`doctor --fix`), incl. Playwright report/trace links.**
  Extend `doctor` from detect-only to optional, deterministic repair of broken relative links in
  `context/` (reusing the auditskill `apply-step` dry-run/write pattern), explicitly handling
  Playwright report/trace paths surfaced by `qa-playwright-cli` / the Playwright result MCP. Lands:
  `doctor/index.ts`, `cli.ts`, `tests/`. **Done when:** `doctor --fix` repairs known broken-link
  classes (dry-run by default), leaves unfixable links as findings, and tests cover both paths.
  Traces: TECH §11 ("mechanical enforcement + remediation-carrying errors").

- **🧊 R-032 — C4 (4-level) architecture-documentation standard.** Adopt the C4 model (L1 Context →
  L2 Container → L3 Component → L4 Code) as the architecture-doc standard for `context/reference/`
  produced by `qa-reverse-engineer` (R-019), rendered through the Mermaid `diagram-conventions`
  guideline (R-025). Lands: `model/context.ts` (`GUIDELINES` + reference templates),
  `model/skills.ts` (`qa-reverse-engineer`), TECH §12. **Done when:** reverse-engineer emits
  C4-structured architecture docs, `diagram-conventions` maps each C4 level to a diagram type, parity
  green. Traces: R-019, R-025, TECH §12.

- **🧊 R-033 — "Review related guidelines before work" rule.** A standing procedural rule in the lean
  root config: every write skill's first step is to read all related guidelines/standards before
  acting (composes with R-029 grounding and R-028 docs-as-code). Lands: `model/context.ts` (root
  config), `model/skills.ts` (procedure preambles), `doctor/index.ts` (optional check), TECH §11.
  **Done when:** the rule is in the root config, write-skill procedures open with a "read related
  guidelines" step, parity green. Traces: TECH §11.

> **ID notes — R-011 dropped, R-016 merged.** `R-011` (k6 / performance) was removed from the backlog
> as deprioritized; `R-016` (richer observability) was folded into **R-012**. IDs are append-only and
> never reused, so both stay permanent gaps (like R-007), not slots to fill.

## Conventions for tracking

- One PR/commit per `R-###` where practical; commit subject `type(R-###): summary`.
- On ship: flip status to ✅, add a row to **Shipped** with version + commit, bump the package version(s),
  and update the linked PRD/TECH section. Keep `qa-gardening` itself honest — run `doctor` before shipping.
- Keep this list pruned: move stale ideas to backlog, delete dead ones.
