# claude-qa-orchestrator

Scaffold an AI-driven **QA-process orchestration** into your repository for **Claude Code**.

Twin of [`copilot-qa-orchestrator`](../copilot-qa-orchestrator) — same orchestration, different
harness. Both are built on the shared `@qa-orch/core`.

## What it does

Two phases:

1. **Phase 1 — installer (`npx`, deterministic, no LLM).** Detects your test stack (Playwright
   TS/Java, RestAssured/JUnit/TestNG), runs a short wizard, and writes:
   - `CLAUDE.md` — a lean root "map" (table of contents, not a manual).
   - `.claude/skills/<name>/SKILL.md` — the QA skill suite (`qa-init`, `ticket-review`,
     `test-plan`, `test-case-design`, `automation-bootstrapper`, `test-automate`, `rca`,
     `test-data-gen`, and the `qa-new → … → qa-archive` backbone).
   - `.ai/guidelines/*.md` — QA conventions & test naming.
   - `context/` — the system of record (`foundation/`, `changes/`, `archive/`).
   - `.mcp.json` — for Playwright, a read-only `playwright-results` MCP server over the HTML report + traces, so `rca`/`test-automate` read results directly (empty stub for other stacks).
2. **Phase 2 — in Claude Code (LLM).** Run the `qa-init` skill; it interviews you and fills the
   remaining `{{PLACEHOLDER}}` markers into finished foundation docs and skills.

## Usage

```bash
npx claude-qa-orchestrator init            # interactive
npx claude-qa-orchestrator init --yes      # accept detected defaults (CI)
npx claude-qa-orchestrator init --root ./path/to/repo
```

Scaffolding is **idempotent**: existing files are never overwritten. Delete `context/` and the
generated config to regenerate.

## Validate (`doctor`)

```bash
npx claude-qa-orchestrator doctor            # validate the scaffold in the current repo
npx claude-qa-orchestrator doctor --root ./path/to/repo
```

A deterministic check (no LLM) that runs **outside the agent loop**: verifies structure, the handoff
manifest, that no phase-1 placeholders leaked, that relative links resolve, and that the iron QA rule
is present. Findings carry remediation text; it exits non-zero on errors (CI-friendly).

Requires Node.js ≥ 20.

See the repo root `PRD.md` and `TECH.md` for the full design.
