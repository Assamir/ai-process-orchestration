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
| 0.28.0 | **R-038** Version-aware `update` — `manifest.toolVersion` records the package version that scaffolded the repo (set by `init`, sourced from the leaf `package.json` via `CliMeta.version`; refreshed by `update --write`). `update` compares it against the running tool (`compareToolVersions`, dependency-free numeric semver compare) and reports a `VersionInfo` (`scaffolded`/`running`/`direction`): the CLI prints `scaffolded X → running Y` and **warns on a downgrade**. Pre-R-038 manifests report `unknown` and behave exactly as before. Foundation for the changelog (R-042, deltas from `toolVersion`) and the 3-way merge (R-039 → R-041) | `440be6a` | `packages/core/src/types.ts` (`ScaffoldManifest.toolVersion`), `update/index.ts` (`compareToolVersions`, `VersionInfo`), `scaffold/index.ts` (`ScaffoldInput.toolVersion`), `cli.ts` (`CliMeta.version`), `index.ts`, both leaf `src/index.ts` (import `package.json` version), `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.29.0 | **R-039** Baseline stored as **content** (not just a hash) — each `manifest.files` entry graduates from a bare sha256 string to a self-contained `FileBaseline` object (`{ hash, content }`) recording the full canonical rendered base (`scaffold/index.ts:fileBaseline`, written by both `scaffold` and `update --write`). `update` proves pristineness by a direct **content** compare and keeps the base on hand for the R-040 3-way merge — **no git dependency**. A `readBaseline` normalizer tolerates all three historical shapes: R-039+ object, R-034..R-038 hash-only string (pristine by sha256, no merge base), pre-R-034 absent (additive-only); on `drift` the prior entry is preserved verbatim. Trade-off: a larger manifest (~85 KB for the default Playwright-TS scaffold), accepted to keep the merge base self-contained. *Prerequisite for R-040.* | `b2aca03` | `packages/core/src/types.ts` (`FileBaseline`, `ScaffoldManifest.files`), `scaffold/index.ts` (`fileBaseline`), `update/index.ts` (`readBaseline`), `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.30.0 | **R-040** 3-way merge engine in `update` — a self-contained, dependency-free line-based **diff3** (`update/merge.ts`, `merge3`) replays the upstream delta (recorded base → current template) onto user-edited files. Two new actions refine `drift`: **`merge`** (upstream + local edits combine cleanly → applied on `--write`, base advances to the template so the next run is reconciled) and **`conflict`** (edits overlap the same region and differ → reported with conflict markers, **never written** in R-040; R-041 adds interactive resolution). Files with no recorded base content (pre-R-039 hash-only / pre-R-034 absent) or no upstream delta fall back to classic `drift`, untouched. Safety bias: touching-but-disjoint edits stay independent (both apply); any genuine overlap is reported as a conflict rather than guessed (a false conflict is harmless — file left in place; a wrong auto-merge would not be). *Depends on R-039.* | `8d53e64` | `packages/core/src/update/merge.ts` (new), `update/index.ts` (`merge`/`conflict` actions), `cli.ts`, `index.ts`, `tests/merge.test.ts` (new), `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.32.0 | **R-042** Template changelog — machine-computed delta. `update` now reports the **upstream template delta** between the scaffolded and running versions (added/changed/removed **skills**, **guidelines**, **files**), derived purely from the recorded manifest baseline vs. the current rendered templates (`update/changelog.ts`, `computeChangelog` → `UpdateReport.changelog`). It is **template-side and independent of the user's on-disk edits** — a file the user deleted or rewrote still shows as `changed` iff the *template* changed, answering "what's new upstream?" distinct from `update`'s per-file repo actions. Every entry traces to a real difference in the recorded base (nothing invented); a path-derived classifier (built from the adapter's own skill/guideline path shapes, so it also names *removed* skills no longer in `SKILLS`) tags each entry `skill`/`guideline`/`file`. The `manifest.toolVersion` anchor (R-038) labels the window (`fromVersion → toVersion`); after `update --write` advances the baseline, the next run's changelog is empty. Pre-R-034 manifests (no baseline) yield no changelog. The CLI prints it as a grouped "Upstream template delta X → Y" note before the repo-side plan. *Depends on R-038.* | `5d37d98` | `packages/core/src/update/changelog.ts` (new), `update/index.ts` (`UpdateReport.changelog`), `cli.ts`, `index.ts`, `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.33.0 | **R-043** `update --interactive` (file-by-file walk) — a `-i`/`--interactive` mode that steps through each change one file at a time (**apply / skip / show diff**) instead of the bulk `--write`, for reviewing a large migration. The classifier attaches a `preview` (`{ before?, after }`) to every actionable `create`/`update`/`merge` item so the walk renders a compact unified line diff (`merge.ts:diffLines`, one `@@`-hunk per changed region); `walkChanges` (`update/resolve.ts`, alongside the R-041 conflict form) prompts apply/skip/diff per file **and** resolves conflicts region-by-region in one document-order pass. A new `runUpdate` `apply?: string[]` option **signals interactive mode by its presence** (even empty): only listed files are written, every other actionable file is reported `skipped: true` and **left untouched with its baseline preserved** (offered again next run); conflicts stay gated by `resolutions`, never by `apply`. Absent `apply` ⇒ bulk write, exactly as before; `--interactive` requires a TTY and otherwise falls back to a dry-run preview, so CI is unchanged. *Completes the version-aware-`update` epic (R-038→R-043).* | `63787d9` | `packages/core/src/update/merge.ts` (`diffLines`), `update/resolve.ts` (`walkChanges`/`ChangeItem`/`WalkResult`), `update/index.ts` (`apply` option, `UpdateItem.preview`/`skipped`), `cli.ts` (`--interactive`), `index.ts`, `tests/merge.test.ts`, `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
| 0.35.0 | **R-046** `qa-performance` skill (write) + JMeter detection + `jmeter-results` MCP — a JMeter-first performance skill that **generates/audits a `.jmx` plan** (thread groups, HTTP/JDBC samplers, SLA assertions, think-time timers, CSV Data Set Config, correlation), **runs headless** (`jmeter -n -t … -l …jtl -e -o …`, CI-safe; GUI only to author), and **enforces NFRs** (p95/p99 response time, throughput, error-rate) where every performance case **traces to an NFR / acceptance criterion** (the iron QA rule from the non-functional side; composes with `spec-driven-development`). Phase 1 **detects JMeter** (a `.jmx` plan in the repo via a bounded scan, or a `jmeter` build entry) into `DetectedStack.performance` — orthogonal to the functional `frameworks` — and wires a **`jmeter-results`** MCP server over `./jmeter-report` (HTML dashboard) + `./jmeter-results` (`.jtl`), the result-legibility pattern of `playwright-results`/`pytest-results`/`jvm-results`/Allure. Renders with the write allowlist on both platforms; wired from `qa-test-automate` + `qa-ci-pipeline` `## Next`. The suite is now **21 skills** | `d7cec27` | `packages/core/src/types.ts` (`DetectedStack.performance`), `detect/{index,node,java,python}.ts` (+ `.jmx` scan), `model/mcp.ts` (`jmeter-results`), `model/skills.ts` (`qa-performance`), `scaffold/index.ts`, `wizard/index.ts`, `tests/{detect,mcp,scaffold}.test.ts`, `PRD.md` §5, `TECH.md` §5 |
| 0.35.0 | **R-047** `performance-testing` guideline — codifies the standard `qa-performance` embodies: NFRs first (p95/p99 / throughput / error-rate budgets before scripting), **percentiles not averages**, a recorded **baseline** to compare against, load profiles (load / stress / soak / spike), and anti-patterns (no think-time, asserting on averages, GUI runs in CI). Same guideline standard (mandatory ✅/❌ examples + `## Applicable patterns` + `PERF_PATTERNS` / `PROJECT_PERF_WORKFLOW` phase-2 slots); referenced by name from `qa-performance`; `doctor` expects the file + its examples (like `diagram-conventions`/`spec-driven-development`). *Shipped with R-046.* | `d7cec27` | `packages/core/src/model/context.ts` (`GUIDELINES`), `tests/scaffold.test.ts`, `TECH.md` §12.1, `PRD.md` §8 |
| 0.36.0 | **R-051** `doctor` as a CI **pull-request gate** — `qa-ci-pipeline` (R-027) now wires the deterministic, read-only `doctor` validator (`npx <qa-orchestrator> doctor`) as a PR gate that **fails the build on scaffold errors** (broken relative links, leftover phase-1 placeholders, a missing iron QA rule, a guideline without good/bad examples), optionally adding `update --dry-run` to surface upstream template drift in the PR; delivers what the `documentation-as-code` (R-028) guideline already promised — "docs kept in sync by CI" — at the CI boundary, with no extra dependency beyond the orchestrator package via `npx`. The skill's **audit** mode also checks an existing pipeline runs the gate. No new skill (suite stays **21**); the body's docs-as-code step + Done-when carry the gate, and the `documentation-as-code` guideline's standing promise is now actually fulfilled. *Extends R-027/R-028.* | `94cd0b5` | `packages/core/src/model/skills.ts` (`qa-ci-pipeline`), `tests/scaffold.test.ts`, `PRD.md` §5/§8, `TECH.md` §5 |
| 0.39.0 | **R-059** Artifact template registry (single source of artifact shape) — the runtime artifacts under `context/changes/<work-id>/` (`work`/`plan`/`cases`/`automation`/`performance`/`bug-report`) get their shape lifted into one registry (`core/src/model/artifacts.ts`, `ARTIFACTS` + `tpl()`), analogous to `GUIDELINES`/`FOUNDATION`, with **parseable, stable trace markers**: `work.md` gives each acceptance criterion a stable `AC<n>` id and seeds frontmatter `status: in-progress`; `cases.md` carries `Traces to: AC<n>` (its `traceField`); `automation.md` carries `Covers: TC<n>`; `performance.md` traces each NFR to an AC. The six producing skills embed their canonical template via `tpl(name)` inside a fenced `## Template` section (parser-safe — `skill-flows` reads only When-to-use/Procedure/Next, so the generated catalog is **unchanged** and the parity test holds automatically). Each `ArtifactTemplate` also carries the `requiredSections` a validator will check. Scope is strictly `context/changes/<work-id>/*` (foundation/reference already have seeded templates + `doctor` checks). **Prerequisite for R-060 (persisted analyses) and R-061 (the `doctor` work-item validator + `status:` gating)** — the registry is the single shape both read. *First item of the runtime-artifact-integrity epic R-059→R-061.* | `6eb9e27` | `packages/core/src/model/artifacts.ts` (new), `model/skills.ts` (6 producing skills), `index.ts`, `tests/artifacts.test.ts` (new), `tests/scaffold.test.ts`, `PRD.md` §5/§8, `TECH.md` §11/§12, `ROADMAP.md` |
| 0.38.0 | **R-052** Product user documentation — the product's own docs are **generated from the skill suite** so they can't drift. `core/src/docs/skill-flows.ts` reads `model/skills.ts` and emits `docs/skill-catalog.md`: a per-skill usage flow for **all 21 skills** (trigger/inputs → key procedure steps → artifacts → `## Next`, parsed from each body) **plus** the aggregate flows — the orchestration graph (each bucket a lifecycle swimlane, every `## Next` edge drawn), the two-phase install, the daily loop, and the detection/wizard/MCP wiring. Every diagram is wrapped in the R-054 `@formatter:off`/`@formatter:on` guards (born compliant). The generator is **read-only over `skills.ts`** (ships nothing into target repos / generated `SKILL.md`s → **no parity impact**) and deterministic, so the committed catalog is **snapshot-verified** in `tests/skill-flows.test.ts` (a new skill auto-appears; un-regenerated drift fails CI; `npm run docs` regenerates via a thin `WRITE_DOCS=1` wrapper). Ships with a root `README.md`, a `docs/README.md` product guide, and a **test-backed** `examples/README.md` walkthrough whose file-tree + CLI claims are verified by `tests/examples.test.ts` (incl. a `doctor`-clean assertion). Documentation-as-code applied to the product itself. *Closes the docs/formatting bundle (R-054 → R-052).* | `2c4ae59` | `README.md`, `docs/{README,skill-catalog}.md`, `examples/README.md`, `packages/core/src/docs/skill-flows.ts` (new), `src/index.ts`, `scripts/gen-docs.mjs` (new), `tests/{skill-flows,examples}.test.ts` (new), root `package.json` (`docs` script), both leaf `README.md`, `TECH.md` §12.4, `PRD.md` §8 |
| 0.37.0 | **R-054** `code-formatting` guideline — formatting is **deterministic and tool-owned**: the configured autoformatter/linter (rendered from the detected `LINTERS`) is the single source of truth for whitespace, wrapping, and **import order**, run on save / pre-commit / in CI so diffs stay about behavior. Its load-bearing piece is the **generalized `@formatter:off` / `@formatter:on` autoformatter safeguard** — content the formatter would mangle (chiefly Mermaid diagrams, also aligned tables / ASCII art / ordered literals) is fenced off so a format pass can't reflow it (Markdown HTML-comment form `<!-- @formatter:off -->` … `<!-- @formatter:on -->`, or the language's line-comment form in code). **Broadens** a Mermaid-only safeguard (adapted from `.external`) into a general standard and **composes with `diagram-conventions`** — every rendered Mermaid block is now wrapped, so the shipped `diagram-conventions` example fences (and `TECH.md` §12.2's fence) are **born compliant**. `doctor` enforces a content contract (`FORMATTER:guards`, **error** — must mention both `@formatter:off` and `@formatter:on`), parallel to `ENVMGMT:contract` / `DOCASCODE:contract` / `GROUNDING:contract`. Same guideline standard (mandatory ✅/❌ examples + `## Applicable patterns` + `FORMATTER_PATTERNS` / `PROJECT_FORMATTING_WORKFLOW` phase-2 slots). *Lands the docs/formatting bundle's safeguard before R-052 ships its diagram set.* | `558474c` | `packages/core/src/model/context.ts` (`GUIDELINES` — new `code-formatting` + wrapped `diagram-conventions` fences), `doctor/index.ts` (`FORMATTER:guards`), `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §12.1/§12.2, `PRD.md` §8 |
| 0.34.0 | **R-044** `assumptions` guideline + `## Assumptions` protocol — inference is legal **only** inside a `## Assumptions` table (`ID | Claim | Basis | Impact | Verification | Confidence`), referenced inline as `(A1)`; inferred content *outside* the table is a hallucination. `Basis` must be concrete evidence (`file:line` / MCP / user quote), never "common practice"; confidence is calibrated ("high is rare"). Complements R-029 grounding (grounding says *cite*; this says *how to legalize what you can't yet cite*). Ships on both platforms via `GUIDELINES` (mandatory ✅/❌ examples + `## Applicable patterns` + `ASSUMPTIONS_PATTERNS` / `PROJECT_ASSUMPTIONS_WORKFLOW` phase-2 slots); referenced by name from the claim-producing skills (`qa-ticket-review`, `qa-rca`, `qa-bug-report`, `qa-coverage-gap`, `qa-reverse-engineer`) and added to the read-before-you-write list; `doctor` expects the file + its examples (like `diagram-conventions`/`spec-driven-development`). Adapted from `.external/guidelines/assumptions-rules.md` + `assumptions-protocol.instructions.md` | `e46a0d7` | `packages/core/src/model/context.ts` (`GUIDELINES`), `model/skills.ts`, `tests/scaffold.test.ts`, `TECH.md` §12.1, `PRD.md` §8 |
| 0.34.0 | **R-045** `grounding` upgrade — evidence-collection standard. Sharpened the existing `grounding` guideline (no new file) from "cite something" to a **ranked evidence-type table** (source code `file#L-L` > config > test > result-MCP > ticket > existing doc > git > web > user-quote), a **minimum-context rule** (≥10 lines / whole method for code citations), and an **identifier scrub checklist** (every class/method/endpoint/env-var/ticket-key verified present before it ships). `doctor`'s `GROUNDING:contract` check strengthened to also require *evidence* (alongside *cite* + *uncertainty*), so gutting the evidence standard fails. Adapted from `.external/.github/skills/evidence-collection/SKILL.md` | `e46a0d7` | `packages/core/src/model/context.ts` (`GUIDELINES` — `grounding`), `doctor/index.ts`, `tests/scaffold.test.ts`, `tests/doctor.test.ts`, `TECH.md` §12.1, `PRD.md` §8 |
| 0.31.0 | **R-041** Interactive conflict-resolution form (`@clack/prompts`) — `update --write` now resolves R-040 conflicts instead of only reporting them. `merge3` additionally returns the merge as ordered **regions** (`MergeRegion[]`) and `update` surfaces them on each `conflict` item (`UpdateItem.conflict = { regions, count }`); a new `applyResolutions(regions, choices)` rebuilds a marker-free file from per-conflict picks. On a TTY the CLI runs a **two-pass** flow — classify (dry-run) → prompt → apply — handing conflicts to `resolveConflicts` (`update/resolve.ts`, the QA analog of the `init` wizard, **deterministic, no LLM**): per conflict the user picks *keep mine* / *take theirs* / *show diff (mine/base/theirs)* / *skip file*. Resolved files are written via `runUpdate({ write, resolutions })` with the base advanced to the template (reconciled, like a clean `merge`); skipped files stay `conflict` and untouched. Non-interactive/CI runs (no TTY) behave exactly as R-040. *Depends on R-040.* | `b2fe6b1` | `packages/core/src/update/merge.ts` (`MergeRegion`/`applyResolutions`), `update/resolve.ts` (new), `update/index.ts` (`resolutions`, `UpdateItem.conflict`), `cli.ts`, `index.ts`, `tests/merge.test.ts`, `tests/update.test.ts`, `TECH.md` §11, `PRD.md` §8, `ROADMAP.md` |
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
> (reserved/skipped), not a slot to fill. The current shipped suite is **21 skills** (the 13 of R-001,
> `qa-gardening` from R-004, `qa-bug-report` + `qa-reverse-engineer` from R-018/R-019,
> `qa-coverage-gap` from R-022, `qa-metrics` from R-012, `qa-playwright-cli` from R-024,
> `qa-ci-pipeline` from R-027, and `qa-performance` from R-046); see the skill × model × tooling matrix in TECH §5.

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
source repo map) in **v0.26.0**, and R-036 (`test-data-management` guideline) in **v0.27.0**, and R-038
(version-aware `update` — record + compare `toolVersion`) in **v0.28.0** (first item of the
version-aware-`update` epic), and R-039 (baseline stored as content — `FileBaseline { hash, content }`)
in **v0.29.0**, and R-040 (3-way diff3 merge engine — `merge`/`conflict` actions) in **v0.30.0**
(third epic item), and R-041 (interactive `@clack/prompts` conflict-resolution form) in **v0.31.0**
(fourth epic item), and R-042 (machine-computed template changelog — upstream delta in the `update`
output) in **v0.32.0** (fifth epic item), and R-043 (`update --interactive` file-by-file walk) in
**v0.33.0** (sixth and final epic item — the version-aware-`update` epic R-038→R-043 is **complete**),
and R-044 (`assumptions` guideline + `## Assumptions` protocol) and R-045 (`grounding` upgrade —
evidence-collection standard) together in **v0.34.0** (the `.external`-adapted anti-hallucination pair),
and R-046 (`qa-performance` JMeter skill + detection + `jmeter-results` MCP) with R-047
(`performance-testing` guideline) together in **v0.35.0**, and R-051 (`doctor` as a CI pull-request
gate, wired by `qa-ci-pipeline`) in **v0.36.0**, and R-054 (`code-formatting` guideline + the generalized
`@formatter:off/on` autoformatter safeguard + `doctor` `FORMATTER:guards`) in **v0.37.0** (the
docs/formatting bundle's safeguard, landed **before** R-052 ships its diagram set so diagrams are born
compliant), and R-052 (product user documentation — root README + `docs/` guide + test-backed `examples/`
walkthrough + the generated `docs/skill-catalog.md` with per-skill usage flows for all 21 skills) in
**v0.38.0** (completing the docs/formatting bundle R-054 → R-052), and R-059 (artifact template registry —
single source of runtime-artifact shape) in **v0.39.0** (first item of the runtime-artifact-integrity epic
R-059→R-061)._

_R-059 shipped in v0.39.0; the rest of the runtime-artifact-integrity epic (**R-060** persisted analysis
artifacts, **R-061** `doctor` work-item validator + `status:` gating) is queued in the backlog below._ The
backlog also holds the unscheduled functional-coverage candidates **R-048→R-050** (`qa-a11y`,
`test-strategy` guideline, `qa-release-readiness`), **R-053** (`qa-mobile` skill), **R-055** (`qa-security`
skill), and **R-057** (`accessibility-testing` guideline, pairs with R-048).

## Backlog (unscheduled)

> Newly scoped `R-###` items, not yet assigned to a version. Each names its likely landing files and the
> artifact it traces to; scope may still change before scheduling.

**Epic: smart, version-aware `update` (R-038→R-043 — ✅ COMPLETE, all shipped).** Extended
R-034's deliberately conservative `update` (which only *reported* `drift`, never merged) into a
version-aware migrator that knows *what changed* between tool versions and applies only the upstream
delta — performing a **3-way merge** that preserves local edits and prompts the user on true conflicts.
The chain had a strict dependency order (R-038 → R-039 → R-040 → R-041; R-042 depends on R-038; R-043 on
R-040). **R-038 (v0.28.0)** added `toolVersion` + `scaffolded X → running Y`; **R-039 (v0.29.0)**
upgraded the manifest baseline to store the full rendered base **content** (`FileBaseline { hash,
content }`); **R-040 (v0.30.0)** shipped the diff3 merge engine — `drift` files now `merge` cleanly or
report a `conflict`; **R-041 (v0.31.0)** added the interactive `@clack/prompts` conflict-resolution form
(keep mine / take theirs / show diff / skip, per conflict); **R-042 (v0.32.0)** added the machine-computed
template changelog (upstream added/changed/removed skills/guidelines/files in the `update` output, anchored
on `toolVersion`); **R-043 (v0.33.0)** added the interactive file-by-file walk (`update --interactive` —
apply / skip / show diff per file, conflicts resolved region-by-region). Design decisions locked: baseline
stored as **content** (self-contained, no git dependency — ✅ R-039); conflict UI is an **interactive
`@clack/prompts` form** (✅ R-041); changelog is a **machine-computed delta** (no hand-maintained file —
✅ R-042, derived from the manifest baseline vs. current templates); the walk **signals interactive mode
via the `apply` option's presence** and preserves the baseline of skipped files (✅ R-043).

**Epic: runtime-artifact integrity (R-059 → R-061).** Closes the consistency gap between the **skeleton**
(foundation/guidelines, shape seeded + `doctor`-enforced) and the **runtime artifacts**
(`context/changes/<work-id>/*`, shape previously only prose in skill bodies, quality only advisory via
`qa-gardening`). Strict dependency order: **R-059 → R-060, R-059 → R-061** (the registry is the foundation
both build on). **R-059 (v0.39.0 — ✅ shipped, in Shipped table)** lifted artifact shape into the
`ARTIFACTS` registry with parseable trace markers (`AC<n>` / `Traces to:` / `Covers:`) and a seeded
`status:` field. Design forks locked (per the planning checkpoint): goals are *enforcement + shape
consistency + analysis durability* (quality rubric deliberately dropped); analyses persist as files; the
validator **extends `doctor`** + a `status:` frontmatter gate; 3 separate minors (0.39/0.40/0.41).

- **R-060** — **Persist analysis artifacts (v0.40.0, depends on R-059).** Flip the read-only "judges"
  (`qa-rca`, `qa-coverage-gap`, `qa-review`, `qa-ticket-review`, `qa-metrics`) from read-only → write so
  each writes a versioned artifact instead of only chat — an auditable trail (precedent:
  `qa-reverse-engineer` reads code, is `write` because it writes docs). `qa-gardening` **stays read-only**
  (meta-sweep, not an artifact producer). Work-item-scoped reports (`rca.md`/`coverage.md`/`review.md`/
  `ticket-review.md`) land in `context/changes/<id>/`; the cross-cutting `qa-metrics` digest lands in a new
  `context/reports/metrics-<YYYY-MM-DD>.md`. Consequences: write allowlists + read-only buckets shift (parity
  test expectations updated); `ARTIFACTS` (R-059) gains the five report shapes. *Likely lands in:*
  `core/src/model/skills.ts`, `model/artifacts.ts`, `model/context.ts`, `scaffold/index.ts`,
  `tests/{scaffold,artifacts}.test.ts`, PRD §5, TECH §5.
- **R-061** — **Artifact validator in `doctor` + status gating (v0.41.0, depends on R-059).** Make the iron
  QA rule a check on **real files**, not just root-config prose: a new `validateWorkItems(root, adapter)` in
  `doctor/index.ts` (so the R-051 CI gate catches it automatically) parses the R-059 markers and emits
  stable findings — `WORKITEM:<id>:uncovered:<AC>` (an AC with no tracing case — error), `:missing:<artifact>`,
  `:section:<artifact>:<header>` (from `requiredSections`), `:untraced-case` / `:orphan-case` (warn). Gated
  by `work.md` frontmatter `status:` — `in-progress` warns (work in flight is incomplete by definition),
  `ready`/`done` are hard errors; `context/archive/` is read-only history (warn at most). Status lifecycle:
  `qa-new` seeds `in-progress` (already R-059), `qa-review` → `ready`, `qa-archive` → `done`. Safe on a fresh
  scaffold (empty `changes/` ⇒ no findings). *Likely lands in:* `doctor/index.ts`, `model/artifacts.ts`,
  `model/skills.ts` (status transitions), `tests/doctor.test.ts`, PRD §8, TECH §11.

**Functional-coverage candidates (R-048 → R-050, R-053, R-055, R-057, R-058).** Net-new QA capabilities
that fill gaps in the shipped 21-skill suite — independent of each other (no dependency chain), except two
skill+guideline pairs best scheduled together (like R-046+R-047): **R-057** is the guideline for the
R-048 skill, and **R-058** is the guideline for the R-055 skill. (R-051, `doctor`-in-CI, shipped in
**v0.36.0**; R-054 `code-formatting` in **v0.37.0**; R-052 product docs in **v0.38.0** — all in Shipped.)

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
- **R-053** — **`qa-mobile` skill (write) — mobile app testing.** Generates/audits mobile UI tests for an
  orthogonal new stack dimension, mirroring the R-046/R-047 pattern. Phase 1 **detects** a mobile stack
  into a new `DetectedStack.mobile` (Appium / Detox / Maestro config or a build entry, via a bounded scan —
  orthogonal to the functional `frameworks`), defaulting **Appium-first** (cross-platform, fits both the
  JS and JVM stacks already detected) with Detox (React Native) / Maestro / native (Espresso, XCUITest) as
  phase-2 variants, and optionally wires a **`mobile-results`** MCP over the chosen runner's report dir
  (the result-legibility pattern of `playwright-results`/`jmeter-results`). Each mobile case **traces to an
  AC** (iron QA rule). Renders with the write allowlist on both platforms; wired from
  `qa-test-case-design` / `qa-test-automate` `## Next`. Optionally paired with a **`mobile-testing`**
  guideline (device matrix, emulator vs. real device, waits/flakiness — same guideline standard as
  `performance-testing`). *Likely lands in:* `core/src/types.ts` (`DetectedStack.mobile`), `detect/*`,
  `model/mcp.ts` (`mobile-results`), `model/skills.ts` (`qa-mobile`), `scaffold/index.ts`,
  `wizard/index.ts`, `tests/{detect,mcp,scaffold}.test.ts`, PRD §5, TECH §5. *Traces to:* PRD §5.
- **R-055** — **`qa-security` skill (write) — security / DAST testing.** Generates/audits security tests:
  DAST via **OWASP ZAP** (baseline / full scan, **headless & CI-safe**; GUI only to author), dependency
  scanning (`npm audit` / OWASP Dependency-Check), optionally SAST. Each finding maps to an **OWASP
  Top-10** category, and every security case **traces to a security requirement / acceptance criterion**
  (the iron QA rule from the security side; composes with `spec-driven-development`). Phase 1 **detects** a
  security stack into a new `DetectedStack.security` (a ZAP automation plan / `.zap` config, or a
  dependency-scan build entry, via a bounded scan — orthogonal to the functional `frameworks`) and wires a
  **`zap-results`** MCP server over the ZAP report dir (HTML / JSON), the result-legibility pattern of
  `playwright-results`/`jmeter-results`/Allure. Renders with the write allowlist on both platforms; wired
  from `qa-test-automate` + `qa-ci-pipeline` `## Next`. The suite would become **22 skills**. Mirrors the
  R-046/R-047 pattern; likely pairs with a future `security-testing` guideline. *Likely lands in:*
  `core/src/types.ts` (`DetectedStack.security`), `detect/*`, `model/mcp.ts` (`zap-results`),
  `model/skills.ts` (`qa-security`), `scaffold/index.ts`, `wizard/index.ts`,
  `tests/{detect,mcp,scaffold}.test.ts`, PRD §5, TECH §5. *Traces to:* PRD §5.
- **R-057** — **`accessibility-testing` guideline — the guideline pair for R-048.** Codifies the standard
  `qa-a11y` embodies: WCAG **POUR** principles, conformance levels (A / AA / AAA — target **AA**),
  **automated coverage is partial** (~30–40% of WCAG — axe-core/`pa11y` catch contrast, ARIA, missing
  labels, but **not** keyboard traps, focus order, or meaningful sequence), so automated **and**
  manual / assistive-tech checks are both required, plus anti-patterns (treating an axe pass as
  "accessible", testing only the happy path, ignoring keyboard / screen-reader). Same guideline standard
  (mandatory ✅/❌ examples + `## Applicable patterns` + `A11Y_PATTERNS` / `PROJECT_A11Y_WORKFLOW` phase-2
  slots); referenced by name from `qa-a11y` (R-048); `doctor` expects the file + its examples (like
  `diagram-conventions`/`spec-driven-development`/`performance-testing`). **Best scheduled with R-048**
  (skill + guideline together, as R-046+R-047 shipped together). *Likely lands in:*
  `core/src/model/context.ts` (`GUIDELINES`), `tests/scaffold.test.ts`, TECH §12.1, PRD §8.
  *Traces to:* PRD §8, TECH §12.1.
- **R-058** — **`security-testing` guideline — the guideline pair for R-055.** Codifies the standard
  `qa-security` embodies: a **threat model as the input** (what are we protecting, against whom), **OWASP
  Top-10 / ASVS** as the conformance baseline, **shift-left** (SAST + dependency scan early in the loop,
  DAST against a deployed environment), a recorded **vulnerability baseline** to triage new findings
  against (so a known/accepted issue doesn't re-fail the gate), severity triage (CVSS, not raw scanner
  counts), and anti-patterns (scanning without triage, treating a clean ZAP baseline as "secure", secrets
  in scan config — composes with `environment-management`, R-035). Same guideline standard (mandatory
  ✅/❌ examples + `## Applicable patterns` + `SECURITY_PATTERNS` / `PROJECT_SECURITY_WORKFLOW` phase-2
  slots); referenced by name from `qa-security` (R-055); `doctor` expects the file + its examples (like
  `performance-testing`/`accessibility-testing`). **Best scheduled with R-055** (skill + guideline
  together, as R-046+R-047 shipped together). *Likely lands in:* `core/src/model/context.ts`
  (`GUIDELINES`), `tests/scaffold.test.ts`, TECH §12.1, PRD §8. *Traces to:* PRD §8, TECH §12.1.

> **R-054 (v0.37.0) and R-052 (v0.38.0) both shipped** — see **Shipped**. They were scoped here during
> backlog review; full detail moved into their Shipped rows on delivery.

> **ID notes — R-011 dropped, R-016 merged.** `R-011` (k6 / performance) was removed from the backlog
> as deprioritized; the performance concern was later revived on **JMeter** as **R-046/R-047** (shipped
> v0.35.0) under fresh IDs. `R-016` (richer observability) was folded into **R-012**. IDs are append-only
> and never reused, so R-011/R-016 stay permanent gaps (like R-007), not slots to fill.

## Conventions for tracking

- One PR/commit per `R-###` where practical; commit subject `type(R-###): summary`.
- On ship: flip status to ✅, add a row to **Shipped** with version + commit, bump the package version(s),
  and update the linked PRD/TECH section. Keep `qa-gardening` itself honest — run `doctor` before shipping.
- Keep this list pruned: move stale ideas to backlog, delete dead ones.
