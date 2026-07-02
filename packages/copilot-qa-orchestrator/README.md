# copilot-qa-orchestrator

Scaffold an AI-driven **QA-process orchestration** into your repository for **GitHub Copilot in
VS Code**.

Twin of [`claude-qa-orchestrator`](../claude-qa-orchestrator) — same orchestration, different
harness. Both are built on the shared `@qa-orch/core`.

## What it does

Two phases:

1. **Phase 1 — installer (`npx`, deterministic, no LLM).** Detects your test stack (Playwright
   TS/Java, RestAssured/JUnit/TestNG, pytest, JMeter), runs a short wizard, and writes:
   - `.github/copilot-instructions.md` — a lean root "map" (table of contents, not a manual).
   - `.github/prompts/<name>.prompt.md` — the **26-skill** suite (every skill is `qa-<name>`): the
     `qa-init` + `qa-new → … → qa-archive` backbone; design (`qa-ticket-review`, `qa-test-plan`,
     `qa-test-case-design`); automation (`qa-automation-bootstrapper`, `qa-test-automate`,
     `qa-playwright-cli`, `qa-ci-pipeline`, `qa-performance`); and analysis (`qa-rca`,
     `qa-test-data-gen`, `qa-gardening`, `qa-coverage-gap`, `qa-metrics`, `qa-bug-report`,
     `qa-reverse-engineer`). See the [skill catalog](../../docs/skill-catalog.md) for each skill's flow.
   - `.github/agents/qa-orchestrator.agent.md` — a router that drives the prompts.
   - `.github/instructions/*.instructions.md` — the guideline docs (QA conventions, test naming,
     grounding, assumptions, spec-driven development, diagram conventions, documentation-as-code,
     environment & test-data management, performance testing, and code formatting).
   - `context/` — the system of record (`foundation/`, `changes/`, `archive/`, `reference/`).
   - `.vscode/mcp.json` — for Playwright, a read-only `playwright-results` MCP server over the HTML report + traces, so `qa-rca`/`qa-test-automate` read results directly (empty stub for other stacks). Opt-in servers (wizard): the official `@playwright/mcp` **browser** server for interactive exploration in `qa-test-case-design`/`qa-rca`, and a local Atlassian (Jira + Confluence) server for `qa-ticket-review`.
2. **Phase 2 — in Copilot (LLM).** Run the `qa-orchestrator` agent (or the `/qa-init` prompt); it
   interviews you and fills the remaining `{{PLACEHOLDER}}` markers into finished docs and prompts.

## Usage

> **Not published to npm yet** — `npx copilot-qa-orchestrator …` will 404. Run it from
> source today; the **[Running guide](../../docs/RUNNING.md)** has the complete steps
> with exact commands for **PowerShell, cmd, and macOS/Linux**.

```bash
copilot-qa-orchestrator init            # interactive
copilot-qa-orchestrator init --yes      # accept detected defaults (CI)
copilot-qa-orchestrator init --root ./path/to/repo
```

Scaffolding is **idempotent**: existing files are never overwritten. Delete `context/` and the
generated config to regenerate.

## Validate (`doctor`)

```bash
copilot-qa-orchestrator doctor            # validate the scaffold in the current repo
copilot-qa-orchestrator doctor --root ./path/to/repo
copilot-qa-orchestrator doctor --fix      # preview deterministic broken-link repairs (dry-run)
copilot-qa-orchestrator doctor --fix --write   # apply them
```

A deterministic check (no LLM) that runs **outside the agent loop**: verifies structure, the handoff
manifest, that no phase-1 placeholders leaked, that relative links resolve, that every guideline carries
its good/bad examples, and that the load-bearing rules — the iron QA rule and the grounding /
anti-hallucination rule — are present. Findings carry remediation text; it exits non-zero on errors (CI-friendly).

`doctor --fix` adds optional, still-deterministic repair of broken relative links — dry-run preview by
default, `--write` to apply. It fixes links whose target uniquely relocated and disambiguates Playwright
report/trace links (`playwright-report/index.html`, `test-results/**/trace.zip`); links with no unique
target are left as findings to fix by hand.

Requires Node.js ≥ 20.

See the [Running guide](../../docs/RUNNING.md) (install & run, all shells), the
[product guide](../../docs/README.md), the [skill catalog](../../docs/skill-catalog.md), and the
[end-to-end walkthrough](../../examples/README.md). For the full design see the repo root `PRD.md` and
`TECH.md`, and `ROADMAP.md` for delivery status.
