# ROADMAP — QA Process Orchestration

> Single source of truth for **what we build next and how we track it**. Each item names where it
> lands (files), its acceptance criteria, and the artifact it traces to. Update this file in the same
> PR/commit that ships the change.
>
> Linked artifacts: [`PRD.md`](PRD.md) (product) · [`TECH.md`](TECH.md) (architecture, esp. §11
> harness-engineering) · [`CLAUDE.md`](CLAUDE.md) (working guide) · packages
> [`core`](packages/core) · [`claude-qa-orchestrator`](packages/claude-qa-orchestrator) ·
> [`copilot-qa-orchestrator`](packages/copilot-qa-orchestrator) · reference
> [`ai-practices/`](ai-practices) (distilled good/bad AI-engineering practices).

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
| 0.18.0 | **R-028** `documentation-as-code` guideline + `doctor` enforcement — codifies what the product embodies (docs versioned in-repo, reviewed in PR, validated by `doctor`, synced via CI per R-027); ships on both platforms via `GUIDELINES` (with ✅/❌ examples + `DOCS_AS_CODE_PATTERNS`/`PROJECT_DOC_WORKFLOW` phase-2 slots); `doctor` adds a content-contract check (`DOCASCODE:contract`, error) parallel to the iron-QA-rule check | `49b2881` | `model/context.ts` (`GUIDELINES`), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §12.1, `PRD.md` §8 |
| 0.20.0 | **R-030** Spec-driven development guideline — a documented spec / acceptance criteria precede case design, automation, and code; every case derives from (traces to) the spec (the iron QA rule read from the authoring direction). Ships on both platforms via `GUIDELINES` (✅/❌ examples + `SPEC_DRIVEN_PATTERNS`/`PROJECT_SPEC_WORKFLOW` phase-2 slots); the authoring-chain skills (`qa-ticket-review`, `qa-test-case-design`, `qa-test-automate`) reference it by name; `doctor` expects the guideline file + its examples (no extra content-contract check, as with `diagram-conventions`) | `cbac2c6` | `model/context.ts` (`GUIDELINES`), `model/skills.ts`, `tests/scaffold.test.ts`, `TECH.md` §12.1, `PRD.md` §5/§8, `ROADMAP.md` |
| 0.27.0 | **R-036** `test-data-management` guideline — governs the test-data **lifecycle** (isolation between tests/runs, setup/teardown & cleanup, deterministic pinned-and-logged seeds, freshness over stale dumps, no real PII), complementing the R-010 factories/fixtures (which *produce* data; this governs how it's *managed*). Same guideline standard (mandatory ✅/❌ examples + `## Applicable patterns` + `TEST_DATA_PATTERNS`/`PROJECT_TEST_DATA_WORKFLOW` phase-2 slots); composes with `environment-management` (each environment owns its disposable seed) and reinforces the iron QA rule; referenced by name from `qa-test-data-gen` / `qa-test-automate`; `doctor` expects the file + its examples (no extra content-contract check, as with `diagram-conventions`/`spec-driven-development`) | `8bfbf56` | `packages/core/src/model/context.ts` (`GUIDELINES`), `model/skills.ts`, `tests/scaffold.test.ts`, `TECH.md` §12.1, `PRD.md` §8, `ROADMAP.md` |
| 0.26.0 | **R-037** Test-surface ↔ source **repo map** — `context/foundation/repo-map.md`, a navigation aid for large/multi-module/polyglot repos, built by the two-phase flow. **Phase 1** (`detect/repo-map.ts`, no LLM) walks the repo deterministically and inventories build roots (manifests), test directories (by name or test-file content), and test/CI configs — rendered into the `{{REPO_MAP_INVENTORY}}` phase-1 slot (paths as inline code, never links, so it can't trip the broken-link check). **Phase 2** `qa-reverse-engineer` enriches the test↔source map + entry points, reusing C4 L2/L3 names. Inventory is always fresh: `scaffold` walks before writing its own files; `update` re-walks each run (a pristine map refreshes on a layout change, an enriched map is drift and preserved). `doctor` expects the file via the structure + phase-1-render checks | `e193378` | `packages/core/src/detect/repo-map.ts` (new), `model/context.ts` (`FOUNDATION` + root map), `scaffold/index.ts` (`PHASE1_VAR_NAMES`/`buildVars`), `update/index.ts`, `model/skills.ts` (`qa-reverse-engineer`), `tests/scaffold.test.ts`, `TECH.md` §12.2.2, `PRD.md` §5, `ROADMAP.md` |
| 0.25.0 | **R-035** `environment-management` guideline — codifies the test-environment matrix (local/CI/staging) and **secrets indirection**: per-environment base URLs / test accounts / data seeds, all run config flowing through environment variables (the `${VAR}`/`${env:VAR}` pattern the `atlassian`/browser MCP already use for credentials, generalized), never a secret committed to the repo. Ships on both platforms via `GUIDELINES` with mandatory ✅/❌ examples + `ENV_MGMT_PATTERNS`/`PROJECT_ENV_WORKFLOW` phase-2 slots; `doctor` enforces the file + examples **and** a content contract (`ENVMGMT:contract`, error — must mention *secret* + *environment variable*), parallel to `DOCASCODE:contract`/`GROUNDING:contract` | `663df73` | `packages/core/src/model/context.ts` (`GUIDELINES`), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §12.1, `PRD.md` §8, `ROADMAP.md` |
| 0.24.0 | **R-034** `update` — deterministic, no-LLM migration of an initialized repo to the current `core` templates (sibling of `init`/`doctor`). Re-renders templates with the manifest's saved stack/choices and classifies each expected file: `create` (absent → additive), `update` (present + provably *pristine* via a recorded sha256 baseline → safe refresh), `drift` (user-edited / filled-in phase-2 / no baseline → reported, never clobbered), `unchanged`, `orphan` (no longer scaffolded → reported, never deleted). Dry-run by default, `--write` applies + refreshes the manifest baseline; pre-R-034 manifests (no hashes) degrade safely to additive-only. Mirrors the `doctor --fix` / auditskill `apply-step` contract | `f6ab419` | `packages/core/src/update/index.ts`, `scaffold/index.ts` (`scaffoldFiles`/`buildVars`/`hashContent` + manifest `files` baseline), `cli.ts`, `index.ts`, `types.ts`, `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.23.0 | **R-033** "Review related guidelines before work" rule — a standing procedural rule in the lean root config ("Read before you write"): before any **write** skill changes a file it reads the guidelines/standards bearing on the task (`qa-conventions`, `test-naming`, + `spec-driven-development`/`grounding`/`documentation-as-code`/`diagram-conventions` as they apply). The rule lives once in `rootConfigMarkdown` and is injected at the top of every write skill's procedure (`READ_FIRST_STEP`; read-only skills untouched); `doctor` checks its presence (`READFIRST:missing`, **warn** — process-quality gap, not a correctness defect) | `6962383` | `packages/core/src/model/context.ts` (root config), `model/skills.ts` (`READ_FIRST_STEP` injection), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §11, `ROADMAP.md` |
| 0.22.0 | **R-032** C4 (4-level) architecture-documentation standard — `qa-reverse-engineer` now documents architecture with the **C4 model** (L1 Context → L2 Container → L3 Component → L4 Code) rendered through the Mermaid `diagram-conventions` guideline (level→diagram-type table: `C4Context`/`C4Container`/`C4Component`, `flowchart` fallback). Phase 1 scaffolds the C4 skeleton under `context/reference/` (`system-overview.md` index + `c4-context`/`c4-container`/`c4-component` templates); L4 is generated on demand, not a standing file | `4b04264` | `packages/core/src/model/context.ts` (`GUIDELINES` + `FOUNDATION` reference templates), `model/skills.ts` (`qa-reverse-engineer`), `tests/scaffold.test.ts`, `TECH.md` §12.2.1, `PRD.md` §5, `ROADMAP.md` |
| 0.21.0 | **R-031** `doctor --fix` — optional, still-deterministic repair of broken relative links (dry-run preview by default, `--write` to apply); fixes unique-basename relocations + disambiguates Playwright report/trace links (`playwright-report/index.html`, `test-results/**/trace.zip`); unfixable links stay findings, mirroring auditskill's `apply-step` dry-run/write contract | `5d8588b` | `packages/core/src/doctor/index.ts` (`fixLinks`), `cli.ts`, `index.ts`, `tests/doctor-fix.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.19.0 | **R-029** Anti-Hallucination (grounding) rule — a second load-bearing rule in the lean root config (next to the iron QA rule, survives compaction) + a `grounding` guideline: every claim cites a real artifact (`file:line` / ticket id / result-MCP output), nothing is invented, uncertainty is flagged. Referenced by the claim-producing skill procedures (`qa-rca`, `qa-bug-report`, `qa-reverse-engineer`, `qa-coverage-gap`, `qa-metrics`, `qa-review`, `qa-ticket-review`); `doctor` enforces the root-config presence (`GROUNDING:missing`, parallel to `IRONQA:missing`) and the guideline contract (`GROUNDING:contract`, parallel to `DOCASCODE:contract`) | `7fb116d` | `model/context.ts` (root config + `GUIDELINES`), `model/skills.ts`, `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §11/§12.1, `PRD.md` §8 |

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
(guideline-standard upgrade — mandatory ✅/❌ examples) in **v0.16.0**, R-027 (`qa-ci-pipeline` skill)
in **v0.17.0**, R-028 (`documentation-as-code` guideline + `doctor` enforcement) in **v0.18.0**, and
R-029 (anti-hallucination / grounding rule + guideline + `doctor` enforcement) in **v0.19.0**,
R-030 (spec-driven-development guideline) in **v0.20.0**, R-031 (`doctor --fix` deterministic
broken-link repair) in **v0.21.0**, R-032 (C4 architecture-documentation standard) in **v0.22.0**, and
R-033 (read-before-you-write standing rule) in **v0.23.0**, and R-034 (`update` / migrate command) in
**v0.24.0**, and R-035 (`environment-management` guideline) in **v0.25.0**, and R-037 (test-surface ↔
source repo map) in **v0.26.0**, and R-036 (`test-data-management` guideline) in **v0.27.0**. The
backlog below holds the unscheduled **R-038 → R-043** epic (version-aware smart `update`) plus
**R-044/R-045** (assumptions protocol + grounding/evidence upgrade, adapted from `.external`) and
**R-046/R-047** (`qa-performance` JMeter skill + `performance-testing` guideline) and
**R-048→R-051** (`qa-a11y`, `test-strategy` guideline, `qa-release-readiness`, `doctor`-in-CI);
everything else is scheduled._

## Backlog (unscheduled)

> Newly scoped `R-###` items, not yet assigned to a version. Each names its likely landing files and the
> artifact it traces to; scope may still change before scheduling.

**Epic: smart, version-aware `update` (R-038 → R-043).** Extends R-034's deliberately conservative
`update` (which only *reports* `drift`, never merges) into a version-aware migrator that knows *what
changed* between tool versions and applies only the upstream delta — performing a **3-way merge** that
preserves local edits and prompts the user on true conflicts. The chain has a strict dependency order
(R-038 → R-039 → R-040 → R-041; R-042 depends on R-038; R-043 on R-040). Design decisions locked:
baseline stored as **content** (self-contained, no git dependency); conflict UI is an **interactive
`@clack/prompts` form**; changelog is a **machine-computed delta** (no hand-maintained file).

- **R-038** — **`toolVersion` in the manifest + version-awareness in `update`.** Record the package
  version that scaffolded the repo (`manifest.toolVersion`) and compare against the running tool;
  `update` reports `scaffolded 0.27.0 → running 0.30.0` and warns on downgrade. Foundation for the
  changelog (R-042) and meaningful merge. *Likely lands in:* `core/src/types.ts`,
  `scaffold/index.ts` (write `toolVersion`), `update/index.ts`, `cli.ts`, `tests/update.test.ts`.
  *Traces to:* TECH §11 (deterministic `update`).
- **R-039** — **Baseline stored as content (not just a hash).** A 3-way merge needs the *base* (the old
  rendered template), but the manifest records only a sha256. Store the full rendered base content in
  the manifest (or a sidecar) so `update` can diff base→new without git. *Prerequisite for R-040.*
  *Likely lands in:* `core/src/types.ts` (manifest `files` shape), `scaffold/index.ts`,
  `update/index.ts`, `tests/update.test.ts`. *Traces to:* TECH §11.
- **R-040** — **3-way merge engine in `update`.** For `drift` files, compute the upstream delta
  (base → current template) and auto-apply non-conflicting hunks onto the locally-modified file; only
  genuine conflicts remain. Turns `drift` from "untouchable" into "merged where safe". Dry-run shows the
  plan; `--write` applies. *Depends on R-039.* *Likely lands in:* `core/src/update/index.ts` (+ a merge
  util), `tests/update.test.ts`. *Traces to:* TECH §11, PRD §8.
- **R-041** — **Interactive conflict-resolution form (`@clack/prompts`).** On a real conflict, present a
  comparison (mine / theirs / base) and let the user choose per-conflict: *keep mine · take theirs ·
  show diff · skip*. Deterministic, **no LLM** (consistent with the `init` wizard). *Depends on R-040.*
  *Likely lands in:* `core/src/update/index.ts`, `cli.ts`. *Traces to:* TECH §11.
- **R-042** — **Template changelog — machine-computed delta.** Surface what changed between the
  scaffolded and current version (added/changed/removed files, skills, guidelines) in the `update`
  output, derived from the base→new diff. *Depends on R-038.* *Likely lands in:*
  `core/src/update/index.ts` (optionally a `model/changelog.ts`), `tests/update.test.ts`.
  *Traces to:* TECH §11. *Design note (from `.external` `git-sync-changelog`):* borrow the
  **`last_sync_commit` front-matter anchor** pattern — record what version/commit the changelog last
  ran from so each `update` reports only the delta since the previous run, and never invents entries
  (every line traces to a real version bump).
- **R-043** — **`update --interactive` (file-by-file walk).** A mode that steps through each changed file
  (apply / skip / diff), not just bulk apply — convenient for large migrations. *Depends on R-040;*
  optional refinement on top of R-041's conflict interactivity. *Likely lands in:*
  `core/src/update/index.ts`, `cli.ts`. *Traces to:* TECH §11.

**From the `.external` TQA orchestration — reusable, net-new guidelines (R-044, R-045).** Ideas adapted
from a sibling Copilot QA-analysis system; both *complement* the existing `grounding` rule (R-029)
rather than duplicate it — R-029 says "cite a real artifact"; these add the structured mechanism for
*legalizing what can't be cited* and *how to cite by strength*.

- **R-044** — **`assumptions` guideline + `## Assumptions` protocol.** Inference is allowed **only** inside
  a `## Assumptions` table (`ID | Claim | Basis | Impact | Verification | Confidence`), referenced inline
  as `(A1)`; any inferred content *outside* the table is treated as a hallucination. `Basis` must be
  concrete evidence (`file:line` / MCP source / user quote), never "common practice"; confidence is
  calibrated (`low`/`medium`/`high`, "high is rare"). Complements R-029 grounding. Ships on both
  platforms via `GUIDELINES` (mandatory ✅/❌ examples + `## Applicable patterns` + `ASSUMPTIONS_PATTERNS`
  / `PROJECT_ASSUMPTIONS_WORKFLOW` phase-2 slots); referenced by name from the claim-producing skills
  (`qa-reverse-engineer`, `qa-rca`, `qa-bug-report`, `qa-ticket-review`, `qa-coverage-gap`); `doctor`
  expects the file + its examples (like `diagram-conventions`/`spec-driven-development`). *Likely lands
  in:* `core/src/model/context.ts` (`GUIDELINES`), `model/skills.ts`, `doctor/index.ts`,
  `tests/scaffold.test.ts`, `tests/doctor.test.ts`, TECH §12.1, PRD §8. *Traces to:* PRD §8, TECH §11/§12.1
  (adapted from `.external/guidelines/assumptions-rules.md` + `assumptions-protocol.instructions.md`).
- **R-045** — **`grounding` upgrade — evidence-collection standard.** Sharpen the existing `grounding`
  guideline from "cite something" to: a **ranked evidence-type table** (source code `file#L-L` > config >
  test > MCP > existing doc > git > web > user-quote), a **minimum-context rule** (≥10 lines / whole
  method for code citations), and an **identifier scrub checklist** (every class/method/endpoint/env-var/
  ticket-key verified present before it ships). Upgrades the existing guideline content (no new file);
  adds the `GROUNDING:contract` check coverage where useful. *Likely lands in:* `core/src/model/context.ts`
  (`GUIDELINES` — `grounding`), `tests/scaffold.test.ts`, possibly `doctor/index.ts`, TECH §12.1, PRD §8.
  *Traces to:* PRD §8, TECH §12.1 (adapted from `.external/.github/skills/evidence-collection/SKILL.md`).

**Performance testing on JMeter (R-046 + R-047).** Revives the performance-testing concern that was
dropped as **R-011** (k6, deprioritized) — now on **JMeter**, and shipping together as the full result-
legibility path + its governing guideline. (R-011 stays a permanent ID gap; this gets fresh IDs.)

- **R-046** — **`qa-performance` skill (write) + JMeter detection + `jmeter-results` MCP.** A JMeter-first
  (tool-neutral name, room for k6/Gatling later) performance skill that **generates/audits a `.jmx`
  plan** (thread groups, HTTP/JDBC samplers, assertions, think-time timers, CSV Data Set Config for
  parametrization, correlation), **runs non-GUI/headless** (`jmeter -n -t plan.jmx -l results.jtl -e -o
  dashboard/`, CI-safe; GUI only for authoring), and **enforces SLAs/NFRs** (p95/p99 response time,
  throughput, error-rate) where **every performance case traces to an NFR / acceptance criterion** (the
  iron QA rule read from the non-functional side; composes with `spec-driven-development` R-030).
  Phase-1 **detects JMeter** (`.jmx` files / `jmeter` in the build) into `DetectedStack`, and a
  **`jmeter-results` MCP server** exposes the HTML dashboard + `.jtl` (the result-legibility pattern of
  `playwright-results`/`pytest-results`/`jvm-results`/Allure). Renders with the write allowlist on both
  platforms; wired from `qa-test-automate` + `qa-ci-pipeline` (R-027) `## Next`. *Likely lands in:*
  `core/src/model/skills.ts`, `detect/*` (+ JMeter detection), `types.ts` (`DetectedStack`),
  `model/mcp.ts` (`jmeter-results`), `wizard/index.ts`, `scaffold/index.ts`, `tests/scaffold.test.ts`,
  `tests/mcp.test.ts`, PRD §5, TECH §5. *Traces to:* PRD §5 (capabilities).
- **R-047** — **`performance-testing` guideline.** Codifies the performance-testing standard the skill
  embodies: NFRs first (define p95/p99 / throughput / error-rate budgets before scripting), a recorded
  **baseline** to compare against, load profiles (load / stress / soak / spike), and anti-patterns
  (no think-time, asserting on averages instead of percentiles, GUI runs in CI). Same guideline standard
  (mandatory ✅/❌ examples + `## Applicable patterns` + `PERF_PATTERNS` / `PROJECT_PERF_WORKFLOW`
  phase-2 slots); referenced by name from `qa-performance`; `doctor` expects the file + its examples
  (like `diagram-conventions`/`spec-driven-development`). *Ships with R-046.* *Likely lands in:*
  `core/src/model/context.ts` (`GUIDELINES`), `doctor/index.ts`, `tests/scaffold.test.ts`,
  `tests/doctor.test.ts`, TECH §12.1, PRD §8. *Traces to:* PRD §8, TECH §12.1.

**Functional-coverage candidates (R-048 → R-051).** Net-new QA capabilities that fill gaps in the
shipped 20-skill suite — independent of each other (no dependency chain).

- **R-048** — **`qa-a11y` skill (write) — accessibility testing.** Generates/audits accessibility tests
  (axe-core via `@axe-core/playwright`, or `pa11y`/`axe` for the stack at hand), maps each violation to a
  WCAG criterion, and traces every a11y case to an acceptance criterion (iron QA rule). Renders with the
  write allowlist on both platforms; wired from `qa-test-case-design` / `qa-test-automate` `## Next`.
  *Likely lands in:* `core/src/model/skills.ts`, `tests/scaffold.test.ts`, PRD §5, TECH §5.
  *Traces to:* PRD §5.
- **R-049** — **`test-strategy` guideline — test-level balance.** Codifies the unit / integration / e2e
  balance (test pyramid vs. testing trophy), when each level is the right tool, and the "ice-cream cone"
  anti-pattern. Same guideline standard (mandatory ✅/❌ examples + `## Applicable patterns` +
  `TEST_STRATEGY_PATTERNS` / `PROJECT_TEST_STRATEGY_WORKFLOW` phase-2 slots); referenced by name from
  `qa-test-case-design` / `qa-coverage-gap`; `doctor` expects the file + its examples (like
  `diagram-conventions`/`spec-driven-development`). *Likely lands in:* `core/src/model/context.ts`
  (`GUIDELINES`), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, TECH §12.1, PRD §8.
  *Traces to:* PRD §8, TECH §12.1.
- **R-050** — **`qa-release-readiness` skill (read-only) — go/no-go gate.** Aggregates the outputs of
  `qa-coverage-gap` (AC↔case↔test traceability), `qa-metrics` (pass/fail/flakiness + criterion coverage),
  and `tech-debt-tracker.md` into a single release-readiness digest with an explicit go/no-go
  recommendation grounded in real artifacts (composes with the `grounding` rule R-029). Read-only tool
  allowlist; wired from `qa-metrics` / `qa-coverage-gap` `## Next`. *Likely lands in:*
  `core/src/model/skills.ts`, `tests/scaffold.test.ts`, PRD §5. *Traces to:* PRD §5.
- **R-051** — **`doctor` in CI — PR-gate recipe.** Extends R-027 (`qa-ci-pipeline`): a ready CI workflow
  step that runs `doctor` (and optionally `update --dry-run`) as a pull-request gate, failing on scaffold
  errors — closing the `documentation-as-code` loop (R-028) at the CI boundary so a drifted/broken
  scaffold is caught automatically. *Likely lands in:* `core/src/model/skills.ts` (`qa-ci-pipeline`)
  or a CI template, `tests/scaffold.test.ts`, TECH §5, PRD §8. *Traces to:* PRD §8 (closes R-027/R-028).

> **ID notes — R-011 dropped, R-016 merged.** `R-011` (k6 / performance) was removed from the backlog
> as deprioritized; `R-016` (richer observability) was folded into **R-012**. IDs are append-only and
> never reused, so both stay permanent gaps (like R-007), not slots to fill.

## Conventions for tracking

- One PR/commit per `R-###` where practical; commit subject `type(R-###): summary`.
- On ship: flip status to ✅, add a row to **Shipped** with version + commit, bump the package version(s),
  and update the linked PRD/TECH section. Keep `qa-gardening` itself honest — run `doctor` before shipping.
- Keep this list pruned: move stale ideas to backlog, delete dead ones.
