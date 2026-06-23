# QA Process Orchestration

Scaffold an AI-driven **QA / testing-process orchestration** — test planning, ticket
review, case design, automation, RCA, performance, and test-data generation — into
your repository, for **Claude Code** or **GitHub Copilot**, with functional parity.

This is *harness engineering for QA*: it doesn't ship a smarter model, it ships a
lean root "map", a `context/` system of record, and a single-purpose **21-skill**
suite, so an agent stays grounded across long sessions and compaction.

## The two packages

| Package | Harness | Install |
|---|---|---|
| [`claude-qa-orchestrator`](packages/claude-qa-orchestrator) | Claude Code (`.claude/skills/…`) | `npx claude-qa-orchestrator init` |
| [`copilot-qa-orchestrator`](packages/copilot-qa-orchestrator) | GitHub Copilot in VS Code (`.github/…`) | `npx copilot-qa-orchestrator init` |

Both are built on the shared, private `@qa-orch/core` and stay at **parity** (one
shared skill suite, enforced by a parity test). The generated files are in English.

## How it works — two phases

1. **Phase 1 — installer (`npx … init`), deterministic, no LLM.** Detects your test
   stack (Playwright TS/Java, RestAssured/JUnit/TestNG, pytest, JMeter), runs a short
   wizard (or `--yes`), and writes the lean root config, the guideline docs, the
   `context/` skeleton, the skill suite, and a read-only result MCP server.
2. **Phase 2 — in the tool (LLM).** Run `qa-init`; it interviews you and fills the
   `{{PLACEHOLDER}}` markers into finished project knowledge.

```bash
npx claude-qa-orchestrator init --root ./my-app --yes   # phase 1
npx claude-qa-orchestrator doctor --root ./my-app        # validate (deterministic)
npx claude-qa-orchestrator update --root ./my-app        # pull newer templates (dry-run)
```

See the [end-to-end walkthrough](examples/README.md) for a worked run.

## Two load-bearing rules (survive compaction)

- **Iron QA rule** — every behavior under test ships with automated tests in the
  chosen framework; every case traces to an acceptance criterion. Work without
  passing tests is not done.
- **Grounding rule** — every claim cites a real artifact (`file:line`, ticket id,
  result-MCP output); nothing is invented; uncertainty is flagged.

## Documentation

- **[`docs/README.md`](docs/README.md)** — the product guide.
- **[`docs/skill-catalog.md`](docs/skill-catalog.md)** — every skill's usage flow + the orchestration graph (auto-generated from the suite).
- **[`examples/README.md`](examples/README.md)** — an end-to-end walkthrough.
- **[`PRD.md`](PRD.md)** / **[`TECH.md`](TECH.md)** — product requirements + architecture.
- **[`ROADMAP.md`](ROADMAP.md)** — tracked delivery status (`R-###` items).

## This repository

A multi-purpose workspace; the QA-orchestration product lives in `packages/`:

- `packages/` — the npm-workspaces monorepo (`core` + the two npx leaves).
- `vscode/auditskill/` — a separate VS Code Copilot **audit-agents** skill (audits a repo's Copilot config for token bloat).
- `ai-practices/` — a distilled good-vs-bad AI/agent-engineering practice reference.

### Working in the monorepo

```bash
npm install
npm run typecheck   # tsc --noEmit in every package
npm test            # vitest in core (detect/render/scaffold + parity + docs drift-guard)
npm run build       # tsup → dist/index.js (bin) in each leaf
npm run docs        # regenerate docs/skill-catalog.md from the skill suite
```

Requires Node.js ≥ 20.
