# Example — an end-to-end walkthrough

A worked run of `claude-qa-orchestrator` on a Playwright (TypeScript) repo, from a
bare checkout to a reviewed work-item. The `copilot-qa-orchestrator` flow is
identical — only the harness files differ (`.github/…` instead of `.claude/…`).

> The file paths and CLI verbs below are **verified by a test**
> (`packages/core/tests/examples.test.ts`): the scaffold really produces these
> files and `doctor` passes on the result, so this walkthrough can't drift from
> the product.

## 0. Prerequisites

Node.js ≥ 20. Run the scaffolder with `npx` — nothing is installed into the repo.

## 1. Phase 1 — scaffold (deterministic, no LLM)

```bash
npx claude-qa-orchestrator init --root ./my-app --yes
```

`init` detects the stack (here: Playwright + TypeScript + npm), then writes a lean
root "map" and the `context/` system of record. Key files created:

- `CLAUDE.md` — the lean root map (stack, the iron QA rule, the grounding rule, the skill index).
- `.ai/guidelines/qa-conventions.md` — QA conventions (one of eleven guideline docs, incl. `code-formatting`).
- `context/foundation/test-strategy.md` — durable strategy doc (seeded with `{{PLACEHOLDER}}` markers for phase 2).
- `.claude/skills/qa-init/SKILL.md` — the bootstrap skill (one of the 21-skill suite).
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
npx claude-qa-orchestrator doctor --root ./my-app
```

`doctor` is deterministic and runs **outside** the agent loop: it checks
structure, the manifest, leftover phase-1 placeholders, broken relative links, the
guideline good/bad examples, and the load-bearing rules. It exits non-zero on
errors, so `qa-ci-pipeline` can wire it as a pull-request gate.

## 5. Stay current (`update`)

When a newer orchestrator ships new skills/guidelines, pull them into an
already-initialized repo without clobbering your edits:

```bash
npx claude-qa-orchestrator update --root ./my-app             # dry-run preview
npx claude-qa-orchestrator update --root ./my-app --write     # apply (3-way merge)
npx claude-qa-orchestrator update --root ./my-app --interactive  # file-by-file
```

`update` re-renders the current templates with your saved choices, creates missing
files, refreshes pristine ones, and merges or reports conflicts on files you've
edited — it never deletes or silently overwrites your work.

## Where to go next

- [`../docs/skill-catalog.md`](../docs/skill-catalog.md) — every skill's usage flow + the orchestration graph.
- [`../docs/README.md`](../docs/README.md) — the product guide.
- [`../PRD.md`](../PRD.md) / [`../TECH.md`](../TECH.md) — product + architecture.
