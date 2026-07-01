# Embedded test topology — usage guide

> How to scaffold QA orchestration when the **test framework lives inside a developer repo** (an `e2e/`
> folder or a build module), rather than in its own repository.
>
> **Status:** ✅ shipped (v0.66.0–v0.70.0, epic R-095 → R-099). Design record:
> [`design/embedded-test-topology.md`](design/embedded-test-topology.md).

## When to use embedded mode

Use it when there is **no separate test repository** — the test automation is a **subtree of an
application repo**:

- a dedicated folder, e.g. `app/e2e/` or `app/qa-tests/`, **or**
- a build module, e.g. a Maven submodule / Gradle subproject / npm-workspace package under the app repo.

Two variants are supported:

| Variant | Layout | `init --root` points at |
|---------|--------|-------------------------|
| **single-host** | one app repo containing both source and the test subtree | the app repo |
| **multi-host** | a parent with several dev repos; one hosts the test subtree, others are source | the parent |

If your tests already live in a **repo of their own**, you want the [multi-repo
topology](design/multi-repo-orchestration.md), not this one.

## The three topologies at a glance

| Topology | Trigger | Writable area | Read-only |
|----------|---------|---------------|-----------|
| single-repo | one repo, no test subtree singled out | the whole repo | — |
| multi-repo | parent with a dedicated test repo | the test repo | developer repos |
| **embedded** | test framework is a subtree of a dev repo | **config at host root + `{testSubpath}/`** | rest of host source + other dev repos |

## Interactive install (wizard flow)

Run the installer pointed at the app repo (single-host) or the parent (multi-host):

```bash
npx claude-qa-orchestrator init --root <app-or-parent>
# or
npx copilot-qa-orchestrator init --root <app-or-parent>
```

The wizard will:

1. **Detect** candidate test subtrees inside the host (a folder/module carrying a test-framework config
   like `playwright.config` / `testng.xml`, or a test-named module with its own build manifest).
2. **Propose** the most likely one and ask you to **confirm, correct, or decline**. Declining keeps the
   ordinary single-repo / multi-repo behavior.
3. In **multi-host**, if a *dedicated* test repo exists it wins; embedded is offered only when no dedicated
   test repo is found (use the flags below to force embedded in a mixed layout).

## CI / non-interactive install

Embedded mode is **opt-in in automation**. This is deliberate — see the compatibility note below.

```bash
# single-host
npx claude-qa-orchestrator init --root <app> --yes --test-subpath e2e

# multi-host (name the host dev repo and the subtree inside it)
npx claude-qa-orchestrator init --root <parent> --yes --test-host app-a --test-subpath e2e
```

- `--test-subpath <path>` — POSIX-relative path of the writable test subtree inside the host. Must be
  non-empty, relative, not `.`, and exist on disk.
- `--test-host <repo>` — (multi-host only) the developer repo that hosts the test subtree.

> **Why `--yes` alone won't activate embedded mode.** Without `--test-subpath`, `--yes` / CI runs stay on
> the existing single-repo or multi-repo path. This protects the backward-compatibility invariant: an
> existing single-repo install can never *silently* acquire a write-boundary in CI. To get embedded mode in
> automation you must pass `--test-subpath` (and `--test-host` in multi-host).

## What gets generated & where

Orchestration artifacts land at the **host repo root**, exactly like an ordinary scaffold:

- `context/` (system of record), the platform config (`.claude/skills/**` or `.github/prompts+agents/**`),
  and `context/.scaffold/manifest.json`.
- The manifest records the topology under `workspace`:

  ```jsonc
  "workspace": {
    "testRepo": "app-a",   // the host repo, or "." in single-host
    "devRepos": ["app-b"], // read-only siblings; [] in single-host
    "testSubpath": "e2e"   // the writable test subtree inside the host
  }
  ```

- **single-host** — a `host/.vscode/settings.json` with `files.readonlyInclude` (host source) +
  `files.readonlyExclude` (the test subtree + config), so the editor blocks edits to application source.
- **multi-host** — a `<parent>/<parent>.code-workspace` listing the host + sibling repos, with a
  `readonlyExclude` carve-out keeping the host's `{testSubpath}` + config writable while the rest is
  read-only.

## The write-boundary (what's writable vs read-only)

The agent may write **only** to:

- ✅ the orchestration config at the host root (`context/**`, `.claude/**` or `.github/**`, the manifest);
- ✅ the test subtree `host/{testSubpath}/**` (new tests, page objects, fixtures, test data).

The agent must **never** write to:

- 🔒 the rest of the host repo (application source) — read it at `file:line`, never edit;
- 🔒 any other developer repos.

This boundary is enforced in three reinforcing layers: a non-negotiable rule in the lean root config (it
survives context compaction), the `multi-repo-boundaries` guideline, and the out-of-loop `doctor`
leak-check. None is an OS sandbox — the combination is the defense.

## Verifying with `doctor`

```bash
npx claude-qa-orchestrator doctor --root <host-or-parent>
```

`doctor` validates that: `testSubpath` exists and is a subtree of the host, config sits at the host root,
the boundary rule + guideline are present, the editor guardrail file is present, and **nothing has been
written outside the writable set** (a leak into host source or a dev repo is an error). It is read-only and
exits non-zero on errors — run it in CI as a PR gate.

## Migrating with `update`

```bash
npx claude-qa-orchestrator update --root <host-or-parent>          # dry-run
npx claude-qa-orchestrator update --root <host-or-parent> --write  # apply
```

`update` re-renders the boundary rule and guideline from the choices saved in the manifest, creating
missing files and refreshing provably-pristine ones. It **never** clobbers your edits. Note: because the
`.vscode/settings.json` guardrail is produced by a shallow **merge**, `update` treats it as drift and only
**reports** it — apply any readonly-key changes there yourself.

## Troubleshooting

- **"I already have a `.vscode/settings.json`."** The installer shallow-merges only the
  `files.readonlyInclude` / `readonlyExclude` keys and leaves the rest untouched. If those keys already
  exist with different values, the installer leaves your version and `doctor` reports the mismatch — resolve
  it by hand.
- **`doctor` reports a leak.** Something was written into host application source or a dev repo. Move it
  under `{testSubpath}/` (or the host-root config) and re-run.
- **Wizard didn't offer embedded mode (multi-host).** A dedicated test repo was detected and took
  precedence. Force embedded with `--test-host <repo> --test-subpath <path>`.
- **`testSubpath` validation error.** The path must be relative, non-empty, not `.`, and must exist inside
  the host repo.

## See also

- [`design/embedded-test-topology.md`](design/embedded-test-topology.md) — full design record + decision log.
- [`design/adr/0001-embedded-test-topology.md`](design/adr/0001-embedded-test-topology.md) — the ADR.
- [`design/multi-repo-orchestration.md`](design/multi-repo-orchestration.md) — the separate-test-repo topology.
