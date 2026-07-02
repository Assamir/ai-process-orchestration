# claude-qa-orchestrator

Scaffold an AI-driven **QA-process orchestration** into your repository for **Claude Code**.

Twin of [`copilot-qa-orchestrator`](../copilot-qa-orchestrator) — same orchestration, different
harness. Both are built on the shared `@qa-orch/core`.

## What it does

Two phases:

1. **Phase 1 — installer (`npx`, deterministic, no LLM).** Detects your test stack (Playwright
   TS/Java, RestAssured/JUnit/TestNG, pytest, JMeter), runs a short wizard, and writes:
   - `CLAUDE.md` — a lean root "map" (table of contents, not a manual).
   - `.claude/skills/<name>/SKILL.md` — the **27-skill** suite (every skill is `qa-<name>`): the
     `qa-init` + `qa-new → … → qa-archive` backbone; design (`qa-ticket-review`, `qa-test-plan`,
     `qa-test-case-design`); automation (`qa-automation-bootstrapper`, `qa-test-automate`,
     `qa-page-objects`, `qa-playwright-cli`, `qa-ci-pipeline`, `qa-performance`); and analysis (`qa-rca`,
     `qa-test-data-gen`, `qa-gardening`, `qa-coverage-gap`, `qa-metrics`, `qa-bug-report`,
     `qa-reverse-engineer`). See the [skill catalog](../../docs/skill-catalog.md) for each skill's flow.
   - `.ai/guidelines/*.md` — the guideline docs (QA conventions, test naming, grounding, assumptions,
     spec-driven development, diagram conventions, documentation-as-code, environment & test-data
     management, performance testing, and code formatting).
   - `context/` — the system of record (`foundation/`, `changes/`, `archive/`, `reference/`).
   - `.mcp.json` — for Playwright, a read-only `playwright-results` MCP server over the HTML report + traces, so `qa-rca`/`qa-test-automate` read results directly (empty stub for other stacks). Opt-in servers (wizard): the official `@playwright/mcp` **browser** server for interactive exploration in `qa-test-case-design`/`qa-rca`, and a local Atlassian (Jira + Confluence) server for `qa-ticket-review`.
2. **Phase 2 — in Claude Code (LLM).** Run the `qa-init` skill; it interviews you and fills the
   remaining `{{PLACEHOLDER}}` markers into finished foundation docs and skills.

## Usage

> **Not published to npm yet** — `npx claude-qa-orchestrator …` will 404. Run it from
> source today; the **[Running guide](../../docs/RUNNING.md)** has the complete steps
> with exact commands for **PowerShell, cmd, and macOS/Linux**.

```bash
claude-qa-orchestrator init            # interactive
claude-qa-orchestrator init --yes      # accept detected defaults (CI)
claude-qa-orchestrator init --root ./path/to/repo
```

Scaffolding is **idempotent**: existing files are never overwritten. Delete `context/` and the
generated config to regenerate.

## Validate (`doctor`)

```bash
claude-qa-orchestrator doctor            # validate the scaffold in the current repo
claude-qa-orchestrator doctor --root ./path/to/repo
claude-qa-orchestrator doctor --fix      # preview deterministic broken-link repairs (dry-run)
claude-qa-orchestrator doctor --fix --write   # apply them
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
