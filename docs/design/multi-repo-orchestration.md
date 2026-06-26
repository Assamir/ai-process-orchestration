# Design — Multi-repo workspace orchestration (test repo = artifact home, dev repos = read-only source)

> **Status:** ✅ shipped (v0.54.0–v0.59.0) · **Epic:** R-083 → R-088 (multi-repo workspace) ·
> **Tracked in:** [`ROADMAP.md`](../../ROADMAP.md) (Shipped) · **Product sections:** PRD §5/§8, TECH §5/§6/§11.
>
> This is the **design record** captured in an interactive planning session, the same way the
> documentation-pillars epic was first captured in
> [`documentation-pillars-R069-074.md`](documentation-pillars-R069-074.md) before it shipped. It records
> the scenario, the scan-root/write-root contract, and the user-locked decisions the implementation will
> follow. The authoritative per-item record will become the **Shipped** table in `ROADMAP.md` as each item
> lands. This epic **absorbs the deferred R-075** (per-service `context/reference/` split).

## Why

The product is **single-root** today: `npx <pkg> init --root <target>` detects a stack at one directory
and `scaffold` writes *every* file under `join(root, rel)`, with the phase-2 manifest at
`context/.scaffold/manifest.json` (`packages/core/src/scaffold/index.ts:57-95`,
`packages/core/src/cli.ts:52,73,81`).

The user's real working setup breaks that assumption. They open **one parent folder in VSCode** that
contains **several git repositories**:

- **one "test repo"** — carries the test framework; **all** orchestration artifacts (`.claude/skills` /
  `.github/prompts`+`agents`, `context/`, `.mcp.json` / `.vscode/mcp.json`, the manifest) must land here;
- **several "developer repos"** — application source; must be **read-only** and **never modified** by the
  tool or the agents it scaffolds.

The tool must therefore (a) **list** the repos under the parent and let the user **point at** which one is
the test repo, (b) write artifacts **only** into that test repo, and (c) let the skills **read** source
from the sibling dev repos without ever writing to them.

Half the groundwork already exists: `detect/repo-map.ts:buildRepoInventory(root)` recursively walks
sub-directories (depth ≤6, skips `node_modules`/`.git`/build dirs) and discovers module roots + test dirs —
but only as phase-2 inventory markdown, with **no** notion of *selecting* a write target or of *sibling
repos*. Skills (`qa-reverse-engineer`, `qa-framework-analyze`) and the result MCP servers assume
source = artifacts = one root (the "conflation" this epic splits apart).

## Backward-compatibility invariant (load-bearing)

If `--root` resolves to a **single repo** (no qualifying sibling repos found under it), every command
behaves **exactly as today**: scan-root = write-root, no `workspace` block in the manifest, no
`.code-workspace`, no multi-repo guardrail. The parity test (`tests/scaffold.test.ts`) and all existing
tests stay green **unchanged**. Multi-repo behavior activates only when the parent contains ≥2 qualifying
repos and the wizard records a test-repo selection.

## The scan-root / write-root contract

The single seam in `scaffold` is `join(root, …)`. The epic introduces a **scan root** (the parent the
tool inspects + reads source from) distinct from the **write root** (the chosen test repo, the only place
artifacts are written):

- `ScaffoldInput` gains `writeRoot?: string`. When present, every file write and the manifest go under
  `writeRoot`; `root` keeps its meaning as the scan root. When omitted, `writeRoot === root` — today's
  behavior.
- `detectStack` runs on the **chosen test repo** (it drives `AUTOMATION_FRAMEWORK` and the result-MCP dirs
  exactly as now). Dev repos get only a light language/build inventory for the source map.
- The adapter interface (`adapters/types.ts`) is **untouched** — it has no root notion; the split lives in
  `scaffold`/`cli`, so functional **parity is structurally safe**.

### Manifest `workspace` schema

`ScaffoldManifest` gains an optional, additive field (stays `schemaVersion: 1`, like the R-038/R-039
additions):

```jsonc
"workspace": {
  "testRepo": "test-repo",          // path relative to the parent (the write root)
  "devRepos": ["app-a", "app-b"],   // paths relative to the parent (read-only source)
  "workspaceFile": "../my-stuff.code-workspace"  // R-086, parent-relative
}
```

Paths are **relative to the parent**, never absolute — so the test repo stays portable and nothing
machine-specific is committed.

## Source-reference model (Decision 2)

- A new **phase-1 var `DEVELOPER_REPOS`** (added to `PHASE1_VAR_NAMES` + `buildVars`) renders an
  "External source repositories" section into `context/foundation/repo-map.md` and a cross-repo block into
  `context/reference/system-overview.md`. Each dev repo is listed as an **inline-code relative path**
  (`../<dev>/…`) — never a link — so it can't trip `doctor`'s broken-link check (the same trick the R-037
  inventory uses).
- The source-reading skills (`qa-reverse-engineer`, `qa-framework-analyze`, `qa-coverage-gap`,
  `qa-metrics`) reference the dev-repo list from `repo-map.md` and ground at `../<dev>/file:line`.
- When no `workspace` block exists, the var renders empty and the section is omitted → single-repo
  scaffold is snapshot-stable.

## Guardrail layers (Decision 3) — "never write to dev repos"

The full repo pattern for a load-bearing rule (as for the iron-QA / grounding rules), in four reinforcing
layers:

1. **Lean root-config rule** (survives compaction), beside the iron-QA/grounding rules: *"The only writable
   area is the test repo `<name>`. Developer repos are read-only source — never create, edit, or delete
   files in them."* Injected into write skills' preamble like the R-033 read-first rule.
2. **`multi-repo-boundaries` guideline** in `GUIDELINES` — standard shape (mandatory ✅/❌ examples +
   `## Applicable patterns` + `MULTI_REPO_PATTERNS` / `PROJECT_MULTI_REPO_WORKFLOW` phase-2 slots).
3. **`doctor` checks** — `MULTIREPO:contract` (error, the guideline must state the boundary, parallel to
   `ENVMGMT:contract`) and, when the manifest has a `workspace` block, `MULTIREPO:leak:<repo>` (error: the
   dev-repo trees must carry **no** scaffold output).
4. **VSCode read-only pinning** (R-086) — the generated `.code-workspace` sets `files.readonlyInclude` over
   the dev-repo folders so the editor itself blocks edits there.

Honest framing: layers 1–2 are persuasion, 3 catches leaks out-of-loop (it composes with the R-051
`doctor`-as-PR-gate), 4 is a native editor guardrail. None is a hard OS sandbox — the combination is the
defense.

## `.code-workspace` (Decision 4) + the single write exception

`scaffold` (not the adapter → identical content for both platforms, parity-safe) emits
`<parent>/<parent-name>.code-workspace` listing the test repo first + the dev repos as `folders`, plus
`settings."files.readonlyInclude"` globbing the dev-repo folders. This is the **one sanctioned write
outside `writeRoot`** (into the parent). `doctor` gets a narrow "parent allowed" exception so the leak
check ignores this parent-level file; its path is recorded in the manifest so `update`/`doctor` know it.
Emitted only when a `workspace` block exists.

## Hybrid `context/reference/` layout (Decision 6, absorbs R-075)

`qa-reverse-engineer` produces:

- a **top-level `context/reference/system-overview.md`** — the cross-repo landscape + **C4 L1 context**
  spanning all dev repos;
- per-repo **`context/reference/<repo>/`** — **C4 L2/L3** detail and that repo's test-surface lens (R-068).

This maps cleanly onto C4 levels (L1 = system, L2/L3 = per container/repo) and scales to many repos.
`model/context.ts` seeds the top-level index; per-repo folders are created on demand as each dev repo is
reverse-engineered (kept out of the fixed structure check, so an un-documented repo isn't a `doctor`
error). `doctor` validates the top-level index exists.

## `doctor` / `update` re-run model (Decision 5)

Both run with **`--root <test-repo>`** (the manifest is co-located there). They read the `workspace` block
and resolve dev repos via `../<dev>` for the R-085 leak check and the R-086 workspace exception. The core
single-root classification logic in `update` is unchanged.

## The epic — 6 items (R-083 → R-088)

| Item | Scope | Key landing files |
|------|-------|-------------------|
| **R-083** | Backbone: `enumerateRepos` + scan/write-root split + wizard pick + manifest `workspace` | `detect/repo-map.ts`, `scaffold/index.ts`, `types.ts`, `wizard/index.ts`, `cli.ts` |
| **R-084** | Source model: `DEVELOPER_REPOS` var + source-reading skills read `../<dev>` | `scaffold/index.ts`, `model/context.ts`, `model/skills.ts` |
| **R-085** | Guardrail: root rule + `multi-repo-boundaries` guideline + `doctor` `MULTIREPO:*` | `model/context.ts`, `model/skills.ts`, `doctor/index.ts` |
| **R-086** | `.code-workspace` generator + read-only pinning + `doctor` parent exception | `scaffold/index.ts`, `doctor/index.ts`, `docs/RUNNING.md` |
| **R-087** | Hybrid `context/reference/` (top-level L1 + per-repo L2/L3); **absorbs R-075** | `model/skills.ts`, `model/context.ts`, `doctor/index.ts`, `ROADMAP.md` |
| **R-088** | `doctor`/`update` topology awareness + `docs/RUNNING.md` + `examples/README.md` | `doctor/index.ts`, `update/index.ts`, `docs/RUNNING.md`, `examples/README.md` |

Strict order: R-083 is the foundation; R-084/R-085/R-086/R-087 build on its scan/write split + manifest
`workspace` block; R-088 closes the loop on re-run + docs.

## Decision log (session, locked)

| # | Topic | Decision | Rejected alternatives |
|---|-------|----------|-----------------------|
| 1 | Run model | `init --root <parent>` + enumerate sub-repos + interactive wizard pick; split scan/write root; dev repos in manifest | explicit `--test-repo` flag; run-from-inside + `--sources`; `.code-workspace`-driven; marker file |
| 2 | Source model | Relative paths from parent + dev-repo list in manifest + `repo-map.md`/`system-overview.md` section | read-only filesystem MCP; both; absolute paths; `.code-workspace` as truth |
| 3 | Write guardrail | Root-config rule + `multi-repo-boundaries` guideline (✅/❌ + content-contract) + `doctor` check | root-rule + doctor only; tool-allowlist only; read-only-MCP-only; rule without doctor |
| 4 | VSCode workspace | Generate `<parent>.code-workspace` with `files.readonlyInclude` pinning dev repos read-only | inside test repo; docs-only; wizard-optional; full per-folder config |
| 5 | `doctor`/`update` re-run | Point directly at the test repo (`--root <test-repo>`); topology from co-located manifest | target the parent; accept either; parent + `--test-repo`; minimal (no dev scan) |
| 6 | Reference structure | Hybrid top-level `system-overview.md` (C4 L1) + per-repo `reference/<repo>/` (L2/L3); closes R-075 | per-repo subfolder only; single combined file; flat name-prefixed; on-demand only |

## Verification (per shipped item, run at repo root)

1. `npm run typecheck` — all packages clean.
2. `npm test` — the **parity test stays green unchanged** (single-repo path byte-identical), plus new
   tests: `enumerateRepos` discovery, scan/write-root split (manifest under `writeRoot`, `workspace`
   block), `DEVELOPER_REPOS` rendering, the `multi-repo-boundaries` guideline + `doctor` `MULTIREPO:*`
   findings, `.code-workspace` content + the parent exception, the hybrid reference structure.
3. `npm run build` — both leaves bundle.
4. End-to-end on a scratch fixture: parent with `test-repo/` (Playwright) + `app-a/`, `app-b/` (source);
   `init --root <parent> --yes` writes artifacts **only** under `test-repo/`, leaves `app-a`/`app-b`
   untouched, emits `<parent>.code-workspace` with read-only globs, manifest carries the `workspace` block.
5. `doctor --root <parent>/test-repo` → clean; drop a stray file into `app-a/.claude/` and re-run →
   `MULTIREPO:leak` error.
6. Single-repo regression: `init --root <one-repo> --yes` produces today's output exactly.
7. `npm run docs` — regenerated `docs/skill-catalog.md` matches its snapshot.
