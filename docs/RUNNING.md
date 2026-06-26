# Running the orchestrator in your repo

How to install and run `claude-qa-orchestrator` / `copilot-qa-orchestrator` against a
target repository, with exact commands for **PowerShell**, **Windows cmd**, and
**macOS / Linux (bash/zsh)**.

There are two distribution paths and they are documented as equals:

- **[Path A — from npm](#path-a--from-npm-once-published)** — `npx …` one-liners.
  *Available once the packages are published to npm* (they are not yet — see the note
  in that section).
- **[Path B — from source](#path-b--from-source-works-today)** — build the monorepo
  and run the built CLI. **This is what works today.**

Both paths run only **Phase 1** (the deterministic, no-LLM installer). **Phase 2**
runs inside the tool — see [After init — Phase 2](#after-init--phase-2-llm).

> The whole CLI is the same three commands regardless of path: `init` (scaffold),
> `doctor` (validate), `update` (migrate to newer templates). The full flag list is
> in the [Command reference](#command-reference).

---

## Prerequisites

- **Node.js ≥ 20** and **git**.

Check your Node version (identical command in every shell):

```text
node --version
```

If it prints `v20.x` or higher you are good. If `node` is not found or the version is
too old, install the current LTS from <https://nodejs.org> (Windows: the `.msi`
installer; macOS: the `.pkg` installer or `brew install node`).

---

## Path A — from npm (once published)

> ⚠️ **Not available yet.** The packages are **not published to npm** at the time of
> writing (`npx claude-qa-orchestrator …` will fail with *404 Not Found*). Use
> [Path B](#path-b--from-source-works-today) today. The commands below are what you
> will run once they ship — `npx` downloads and runs the package without installing
> anything into your repo.

The invocation is identical across shells (npx resolves the same way everywhere); the
only difference is how you write the target path.

**PowerShell**
```powershell
npx claude-qa-orchestrator init --root C:\path\to\your-repo
```

**Windows cmd**
```bat
npx claude-qa-orchestrator init --root C:\path\to\your-repo
```

**macOS / Linux (bash/zsh)**
```bash
npx claude-qa-orchestrator init --root /path/to/your-repo
```

Use `copilot-qa-orchestrator` instead for GitHub Copilot in VS Code. Then jump to
[After init — Phase 2](#after-init--phase-2-llm).

---

## Path B — from source (works today)

The leaf packages bundle the shared `@qa-orch/core`, but keep `@clack/prompts` as an
external runtime dependency that lives in the monorepo's `node_modules`. So you build
once inside the monorepo and run the built `dist/index.js` from there.

### Step 1 — get the monorepo (once)

```text
git clone <repo-url> ai-process-orchestration
```

### Step 2 — move into it

**PowerShell / cmd**
```text
cd C:\ai\repos\ai-process-orchestration
```

**macOS / Linux**
```bash
cd ~/repos/ai-process-orchestration
```

### Step 3 — install dependencies and build (once, and after every `git pull`)

These two commands are identical in every shell. Run them at the **repo root**:

```text
npm install
npm run build
```

This produces the runnable binaries:

- `packages/claude-qa-orchestrator/dist/index.js`
- `packages/copilot-qa-orchestrator/dist/index.js`

> **Keep `dist/index.js` inside the monorepo.** Do not copy the single file elsewhere
> — it loads `@clack/prompts` from the monorepo's `node_modules`. If you need a
> portable command, use [npm link](#option-b2--global-command-npm-link) or
> [npm pack](#option-b3--portable-install-npm-pack) below instead.

### Step 4 — run it against your target repo

Point at any target with `--root` (you do **not** need to `cd` into the target).
Use the **absolute path** to `dist/index.js`. Add `--yes` to skip the wizard and
accept detected defaults (CI-friendly); drop it for the interactive wizard.

**PowerShell**
```powershell
node C:\ai\repos\ai-process-orchestration\packages\claude-qa-orchestrator\dist\index.js init --root C:\path\to\your-repo --yes
```

**Windows cmd**
```bat
node C:\ai\repos\ai-process-orchestration\packages\claude-qa-orchestrator\dist\index.js init --root C:\path\to\your-repo --yes
```

**macOS / Linux (bash/zsh)**
```bash
node ~/repos/ai-process-orchestration/packages/claude-qa-orchestrator/dist/index.js init --root /path/to/your-repo --yes
```

> Swap `claude-qa-orchestrator` for `copilot-qa-orchestrator` to scaffold for GitHub
> Copilot. Everything else is identical.

Then go to [After init — Phase 2](#after-init--phase-2-llm).

### Option B2 — global command (`npm link`)

If you would rather type `claude-qa-orchestrator` than the long path, link it once.
`npm link` creates a global shim (a `.cmd` wrapper on Windows) and installs the
external dependency, so the command is portable across directories.

**PowerShell / cmd**
```text
cd C:\ai\repos\ai-process-orchestration\packages\claude-qa-orchestrator
npm link
```

**macOS / Linux**
```bash
cd ~/repos/ai-process-orchestration/packages/claude-qa-orchestrator
npm link
```

Now run it from anywhere:

```text
claude-qa-orchestrator init --root C:\path\to\your-repo --yes
```

Remove the global link when you are done:

```text
npm rm -g claude-qa-orchestrator
```

### Option B3 — portable install (`npm pack`)

To install a self-contained tarball (e.g. on a machine without the monorepo
checkout):

```text
cd C:\ai\repos\ai-process-orchestration\packages\claude-qa-orchestrator
npm pack
npm install -g .\claude-qa-orchestrator-0.53.1.tgz
```

(`npm pack` prints the exact `.tgz` filename — it includes the package version.) The
tarball bundles `core` and pulls `@clack/prompts` as a normal dependency, so the
global `claude-qa-orchestrator` command works without the monorepo present. Uninstall
with `npm rm -g claude-qa-orchestrator`.

---

## After init — Phase 2 (LLM)

`init` only runs Phase 1: it detects your stack, writes the lean root config, the
`context/` system of record, the guideline docs, and the skill suite — with
`{{PLACEHOLDER}}` markers left for Phase 2. To finish, open the **target repo** in
the tool and fill the markers:

- **Claude Code** — open the repo and run the **`qa-init`** skill. It interviews you
  (product under test, critical journeys, environments, ticket source) and fills the
  markers into real project knowledge.
- **GitHub Copilot (VS Code)** — open the repo and run the **`qa-orchestrator`** agent,
  or the **`/qa-init`** prompt.

See the [end-to-end walkthrough](../examples/README.md) for a worked run.

---

## Command reference

All three commands take `--root <dir>` (default: the current directory). The first
positional selects the command; with none, `init` runs.

| Command | What it does | Key flags |
|---|---|---|
| `init` | Detect the stack, run the wizard, scaffold the orchestration (default) | `--yes` / `-y` (skip the wizard, accept defaults) |
| `doctor` | Validate an existing scaffold (structure, manifest, leftover placeholders, broken links, the iron QA rule) | `--fix` (repair broken relative links — dry-run), `--write` (apply the repairs) |
| `update` | Migrate an existing scaffold to the current templates (additive + pristine-file refresh; never clobbers your edits) | `--write` (apply), `--interactive` / `-i` (step through each change; needs a terminal) |
| `--help` / `-h` | Show usage | — |

The shell-specific path rules from [Path B Step 4](#step-4--run-it-against-your-target-repo)
apply to every command — only the path separator (`\` vs `/`) and quoting differ; the
arguments are identical. For example, validating then migrating a scaffold:

```text
node <abs-path>/dist/index.js doctor --root <target>
node <abs-path>/dist/index.js update --root <target>            # dry-run preview
node <abs-path>/dist/index.js update --root <target> --write    # apply
```

`doctor` exits non-zero on errors (CI-friendly); `update` is dry-run unless you pass
`--write`. Scaffolding is **idempotent** — `init` never overwrites existing files.

---

## Troubleshooting

- **`node` is not recognized / wrong version.** Node ≥ 20 must be on your `PATH`.
  Re-check with `node --version`; reopen the terminal after installing so `PATH`
  refreshes.
- **`Error: Cannot find module '@clack/prompts'`.** You copied or moved
  `dist/index.js` out of the monorepo. Run it in place from the monorepo, or use
  [npm link](#option-b2--global-command-npm-link) / [npm pack](#option-b3--portable-install-npm-pack)
  for a portable command. (Re-run `npm install` at the repo root if you never installed.)
- **`npx claude-qa-orchestrator` fails with 404.** Expected — the packages are not on
  npm yet. Use [Path B](#path-b--from-source-works-today).
- **`claude-qa-orchestrator` not found after `npm link`.** The npm global bin
  directory isn't on your `PATH`. Find it with `npm prefix -g` (Windows: typically
  `%AppData%\npm`; macOS/Linux: the `bin/` under that prefix) and add it to `PATH`,
  or call the shim by full path. Reopen the terminal afterwards.
- **PowerShell blocks the global shim after `npm link`** (*running scripts is
  disabled*). Allow local scripts for your user once:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Or skip linking and call
  `node …\dist\index.js` directly.
- **Paths with spaces.** Quote them: PowerShell/bash `"C:\My Repos\app"`, cmd
  `"C:\My Repos\app"`.
- **What does `--root .` mean?** The target is the current directory. If you `cd` into
  your target repo first, you can drop `--root` entirely (it defaults to `.`).

---

## See also

- [Product guide](README.md) · [Skill catalog](skill-catalog.md) ·
  [End-to-end walkthrough](../examples/README.md)
- [`PRD.md`](../PRD.md) / [`TECH.md`](../TECH.md) — product requirements + architecture
