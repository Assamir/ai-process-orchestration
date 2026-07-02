# Example — an end-to-end walkthrough

A worked run of `claude-qa-orchestrator` on a Playwright (TypeScript) repo, from a
bare checkout to a reviewed work-item. The `copilot-qa-orchestrator` flow is
identical — only the harness files differ (`.github/…` instead of `.claude/…`).

> The file paths and CLI verbs below are **verified by a test**
> (`packages/core/tests/examples.test.ts`): the scaffold really produces these
> files and `doctor` passes on the result, so this walkthrough can't drift from
> the product.

## 0. Prerequisites

Node.js ≥ 20. The commands below assume `claude-qa-orchestrator` is on your `PATH`;
the packages aren't on npm yet, so see the **[Running guide](../docs/RUNNING.md)** for
how to install & run from source (exact PowerShell / cmd / macOS commands). Once
published, prefix each command with `npx`.

## 1. Phase 1 — scaffold (deterministic, no LLM)

```bash
claude-qa-orchestrator init --root ./my-app --yes
```

`init` detects the stack (here: Playwright + TypeScript + npm), then writes a lean
root "map" and the `context/` system of record. Key files created:

- `CLAUDE.md` — the lean root map (stack, the iron QA rule, the grounding rule, the skill index).
- `.ai/guidelines/qa-conventions.md` — QA conventions (one of fourteen guideline docs, incl. `code-formatting`, `multi-repo-boundaries`).
- `context/foundation/test-strategy.md` — durable strategy doc (seeded with `{{PLACEHOLDER}}` markers for phase 2).
- `.claude/skills/qa-init/SKILL.md` — the bootstrap skill (one of the 26-skill suite).
- `.mcp.json` — a read-only `playwright-results` MCP server over the HTML report + traces.

`--yes` accepts the detected defaults (CI-friendly); drop it for the interactive
wizard. Scaffolding is **idempotent** — existing files are never overwritten.

## 2. Phase 2 — fill the markers (in Claude Code)

Open the repo in Claude Code and run the `qa-init` skill. It reads
`context/.scaffold/manifest.json`, interviews you briefly (product under test,
critical journeys, environments, ticket source), and fills the `{{PLACEHOLDER}}`
markers in the foundation docs and guidelines. After this, the foundation is real
project knowledge, not a template.

## 3. The daily work-item loop

State of record lives under `context/` — read it before acting, update it after.
A typical work-item flows through the suite (see the full hand-off map in
[`../docs/skill-catalog.md`](../docs/skill-catalog.md)):

```text
qa-new → qa-ticket-review → qa-test-plan → qa-test-case-design
       → qa-test-automate → run → (pass) qa-review → qa-archive
                                 → (fail) qa-rca → qa-test-automate
```

Every test case traces to an acceptance criterion (the **iron QA rule**), and
every claim a skill makes cites a real artifact (the **grounding rule**).

## 4. Validate the scaffold (`doctor`)

```bash
claude-qa-orchestrator doctor --root ./my-app
```

`doctor` is deterministic and runs **outside** the agent loop: it checks
structure, the manifest, leftover phase-1 placeholders, broken relative links, the
guideline good/bad examples, and the load-bearing rules. It exits non-zero on
errors, so `qa-ci-pipeline` can wire it as a pull-request gate.

## 5. Stay current (`update`)

When a newer orchestrator ships new skills/guidelines, pull them into an
already-initialized repo without clobbering your edits:

```bash
claude-qa-orchestrator update --root ./my-app             # dry-run preview
claude-qa-orchestrator update --root ./my-app --write     # apply (3-way merge)
claude-qa-orchestrator update --root ./my-app --interactive  # file-by-file
```

`update` re-renders the current templates with your saved choices, creates missing
files, refreshes pristine ones, and merges or reports conflicts on files you've
edited — it never deletes or silently overwrites your work.

## 6. Multi-repo workspaces (a parent of several repos)

If you open **one parent folder that holds several git repos** — a dedicated **test
repo** that carries the test framework, plus one or more **developer repos** with the
application source — point `init` at the parent:

```bash
claude-qa-orchestrator init --root ./my-workspace --yes
```

`init` enumerates the repos under the parent, picks the most **test-like** one as the
test repo (or asks you, without `--yes`), and treats the rest as **read-only
developer repos**. From there:

- **All** orchestration artifacts (`CLAUDE.md`, `context/`, `.claude/skills`,
  `.mcp.json`, the manifest) are written **only into the test repo** — the write root.
- The developer repos are **never modified**. Skills read their source at
  `../<repo>/file:line` to plan and ground tests; the manifest's `workspace` block and
  `context/foundation/repo-map.md` ("External source repositories") record them.
- A `my-workspace.code-workspace` is written into the parent, listing the test repo
  first and pinning each developer-repo folder read-only (`files.readonlyInclude`) so
  VS Code itself blocks edits there.
- A load-bearing **workspace-boundary rule** is added to the root map and every write
  skill, and `doctor` fails the build if any scaffold output leaks into a developer
  repo (`MULTIREPO:leak:<repo>`).

`doctor` and `update` are run pointed **at the test repo** (the manifest lives there):

```bash
claude-qa-orchestrator doctor --root ./my-workspace/test-repo
claude-qa-orchestrator update --root ./my-workspace/test-repo --write
```

A **single-repo** `--root` (no sibling repos found) behaves exactly as sections 1–5
describe — no workspace block, no `.code-workspace`, no boundary rule.

## Where to go next

- [`../docs/skill-catalog.md`](../docs/skill-catalog.md) — every skill's usage flow + the orchestration graph.
- [`../docs/README.md`](../docs/README.md) — the product guide.
- [`../PRD.md`](../PRD.md) / [`../TECH.md`](../TECH.md) — product + architecture.
