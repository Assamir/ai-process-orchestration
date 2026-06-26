# QA Process Orchestration — product guide

This guide explains how the orchestration is put together and how to use it day to
day. For the full per-skill reference, see the auto-generated
[**skill catalog**](skill-catalog.md); for a worked run, see the
[**walkthrough**](../examples/README.md).

## What you get

Running `<claude|copilot>-qa-orchestrator init` scaffolds, into your repo (see the
**[Running guide](RUNNING.md)** for how to install & run — PowerShell / cmd / macOS):

- A **lean root map** (`CLAUDE.md` / `.github/copilot-instructions.md`) — a table of
  contents, not a manual. Knowledge lives in `context/`; the agent pulls it
  just-in-time. The root map also carries the two compaction-surviving rules.
- A **`context/` system of record** — `foundation/` (durable: strategy, plan,
  environments, tools, lessons, tech-debt tracker, repo map), `changes/<work-id>/`
  (in-flight work), `archive/<work-id>/` (completed history), `reference/`
  (reverse-engineered C4 system docs).
- The **guideline docs** (`.ai/guidelines/*.md` / `.github/instructions/*.md`) — QA
  conventions, test naming, grounding, assumptions, spec-driven development, diagram
  conventions, documentation-as-code, environment management, test-data management,
  performance testing, and **code formatting**.
- The **24-skill suite** — one single-purpose skill per QA activity, each rendered
  with the right tool allowlist (read-only vs write) and suggested model tier.
- A read-only **result MCP** server over your test artifacts (Playwright report +
  traces, pytest/JUnit/Surefire-Serenity, Allure history, JMeter dashboard), so
  skills read real outcomes instead of guessing. Opt-in: a Playwright **browser**
  MCP and a local **Atlassian** (Jira + Confluence) MCP.

## The two-phase model

Phase 1 is **100% deterministic** (no LLM, no API key): detect → wizard → write,
skip-if-exists. Only phase-1 placeholders (framework, report language, autonomy,
detected linters, repo-map inventory) are rendered; everything else is left for
phase 2. Phase 2 runs **in the tool**: `qa-init` interviews the QA owner and fills
the remaining `{{PLACEHOLDER}}` markers. See the two-phase and wiring diagrams in
the [skill catalog](skill-catalog.md).

## The daily loop

Each unit of test work is a **work-item** with a stable id, driven through the
suite (`qa-new → qa-ticket-review → qa-test-plan → qa-test-case-design →
qa-test-automate → run → qa-rca on failure → qa-review → qa-archive`). State of
record is `context/` — read it before acting, update it after. Each skill names its
recommended successors in a `## Next` section; those hand-offs form the
orchestration graph in the [skill catalog](skill-catalog.md).

## The three CLI verbs (all deterministic, outside the agent loop)

- **`init`** — phase-1 installer (above).
- **`doctor`** — validates a scaffold: structure, manifest, leftover placeholders,
  broken relative links, guideline good/bad examples, the load-bearing rules, and
  the guideline content contracts (incl. `FORMATTER:guards`). Exits non-zero on
  errors, so `qa-ci-pipeline` wires it as a pull-request gate. `doctor --fix`
  repairs broken links deterministically.
- **`update`** — pulls newer `core` templates into an initialized repo via a 3-way
  merge: creates missing files, refreshes pristine ones, merges or reports
  conflicts on edited files — never clobbering your work. Dry-run by default;
  `--write` applies, `--interactive` steps file-by-file.

## Conventions you can rely on

- **Iron QA rule & grounding rule** live in the root map and survive compaction.
- **Diagrams are Mermaid**, wrapped in `@formatter:off` / `@formatter:on` guards
  (the `code-formatting` standard) so an autoformatter can't break them.
- **Documentation is code** — everything lives in-repo, is reviewed in the same PR,
  and is validated by `doctor` in CI.

## Further reading

- [RUNNING.md](RUNNING.md) — how to install & run in your repo (PowerShell / cmd / macOS).
- [skill-catalog.md](skill-catalog.md) — per-skill flows + orchestration graph (generated; regenerate with `npm run docs`).
- [../examples/README.md](../examples/README.md) — end-to-end walkthrough.
- [../PRD.md](../PRD.md) — product requirements & capabilities.
- [../TECH.md](../TECH.md) — architecture, the platform mapping, harness-engineering rationale.
- [../ROADMAP.md](../ROADMAP.md) — what shipped and what's next.
