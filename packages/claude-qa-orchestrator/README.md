# claude-qa-orchestrator

Scaffold an AI-driven **QA-process orchestration** into your repository for **Claude Code**.

Twin of [`copilot-qa-orchestrator`](../copilot-qa-orchestrator) — same orchestration, different
harness. Both are built on the shared `@qa-orch/core`.

## What it does

Two phases:

1. **Phase 1 — installer (`npx`, deterministic, no LLM).** Detects your test stack (Playwright
   TS/Java, RestAssured/JUnit/TestNG), runs a short wizard, and writes:
   - `CLAUDE.md` — a lean root "map" (table of contents, not a manual).
   - `.claude/skills/<name>/SKILL.md` — the QA skill suite (every skill is `qa-<name>`: `qa-init`,
     `qa-ticket-review`, `qa-test-plan`, `qa-test-case-design`, `qa-automation-bootstrapper`,
     `qa-test-automate`, `qa-rca`, `qa-test-data-gen`, `qa-gardening`, `qa-bug-report`,
     `qa-reverse-engineer`, `qa-coverage-gap`, `qa-metrics`, and the `qa-new → … → qa-archive` backbone).
   - `.ai/guidelines/*.md` — QA conventions & test naming.
   - `context/` — the system of record (`foundation/`, `changes/`, `archive/`).
   - `.mcp.json` — for Playwright, a read-only `playwright-results` MCP server over the HTML report + traces, so `qa-rca`/`qa-test-automate` read results directly (empty stub for other stacks). Opt-in servers (wizard): the official `@playwright/mcp` **browser** server for interactive exploration in `qa-test-case-design`/`qa-rca`, and a local Atlassian (Jira + Confluence) server for `qa-ticket-review`.
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

See the repo root `PRD.md` and `TECH.md` for the full design, and `ROADMAP.md` for delivery status.
