# copilot-qa-orchestrator

Scaffold an AI-driven **QA-process orchestration** into your repository for **GitHub Copilot in
VS Code**.

Twin of [`claude-qa-orchestrator`](../claude-qa-orchestrator) — same orchestration, different
harness. Both are built on the shared `@qa-orch/core`.

## What it does

Two phases:

1. **Phase 1 — installer (`npx`, deterministic, no LLM).** Detects your test stack (Playwright
   TS/Java, RestAssured/JUnit/TestNG), runs a short wizard, and writes:
   - `.github/copilot-instructions.md` — a lean root "map" (table of contents, not a manual).
   - `.github/prompts/<name>.prompt.md` — the QA skill suite (every skill is `qa-<name>`: `qa-init`,
     `qa-ticket-review`, `qa-test-plan`, `qa-test-case-design`, `qa-automation-bootstrapper`,
     `qa-test-automate`, `qa-rca`, `qa-test-data-gen`, `qa-gardening`, `qa-bug-report`,
     `qa-reverse-engineer`, `qa-coverage-gap`, `qa-metrics`, and the `qa-new → … → qa-archive` backbone).
   - `.github/agents/qa-orchestrator.agent.md` — a router that drives the prompts.
   - `.github/instructions/*.instructions.md` — QA conventions & test naming.
   - `context/` — the system of record (`foundation/`, `changes/`, `archive/`).
   - `.vscode/mcp.json` — for Playwright, a read-only `playwright-results` MCP server over the HTML report + traces, so `qa-rca`/`qa-test-automate` read results directly (empty stub for other stacks).
2. **Phase 2 — in Copilot (LLM).** Run the `qa-orchestrator` agent (or the `/qa-init` prompt); it
   interviews you and fills the remaining `{{PLACEHOLDER}}` markers into finished docs and prompts.

## Usage

```bash
npx copilot-qa-orchestrator init            # interactive
npx copilot-qa-orchestrator init --yes      # accept detected defaults (CI)
npx copilot-qa-orchestrator init --root ./path/to/repo
```

Scaffolding is **idempotent**: existing files are never overwritten. Delete `context/` and the
generated config to regenerate.

## Validate (`doctor`)

```bash
npx copilot-qa-orchestrator doctor            # validate the scaffold in the current repo
npx copilot-qa-orchestrator doctor --root ./path/to/repo
```

A deterministic check (no LLM) that runs **outside the agent loop**: verifies structure, the handoff
manifest, that no phase-1 placeholders leaked, that relative links resolve, and that the iron QA rule
is present. Findings carry remediation text; it exits non-zero on errors (CI-friendly).

Requires Node.js ≥ 20.

See the repo root `PRD.md` and `TECH.md` for the full design, and `ROADMAP.md` for delivery status.
