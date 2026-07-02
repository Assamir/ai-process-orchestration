# Design — AI cost & value cockpit (per-user token/cost telemetry + client-facing dashboard)

> **Status:** ✅ shipped (v0.73.0–v0.78.0) · **Epic:** R-100 → R-105 (AI cost & value cockpit) ·
> **Tracked in:** [`ROADMAP.md`](../../ROADMAP.md) (Shipped) · **Product sections:** PRD §5/§8, TECH §5/§11.
>
> **Implemented.** The MVP (R-100 identity + data model, R-101 capture + estimator, R-103 VS Code
> auto-trigger, R-104 dashboard) and phase 2 (R-102 real-usage reconciliation on Claude, R-105 the
> `qa-cost` skill) all shipped, taking the suite to **26 skills**. The data model lives in
> `packages/core/src/model/telemetry.ts`, the zero-dep capture script in `model/capture-script.ts`
> (scaffolded as `context/telemetry/capture.mjs`), the dashboard generator in `docs/cost-dashboard.ts`
> (committed as `docs/cost-dashboard.html`, scaffolded as `context/telemetry/dashboard.html`), and the
> auto-trigger + telemetry-area seeding in `scaffold/index.ts`. `doctor` validates the area
> (`TELEMETRY:index`/`:schema`/`:trigger`).
>
> This is the **design record** captured in an interactive planning session, the same way the
> [multi-repo epic](multi-repo-orchestration.md), the
> [documentation-pillars epic](documentation-pillars-R069-074.md), and the
> [embedded test topology epic](embedded-test-topology.md) were captured before they shipped. It records
> the problem, the data-model/capture contract, and the user-locked decisions the implementation will
> follow. The authoritative per-item record becomes the **Shipped** table in `ROADMAP.md` as each item
> lands. This epic **extends the cost-legibility epic (R-079 → R-081)** — it turns "how heavy is the
> configuration?" (`doctor` token-budget, R-081) into "what did the team actually spend, and what did it
> produce?" — and composes with `qa-metrics` (quality) rather than adding a parallel machinery.

## Why

A **client paying for AI licenses** (Claude Code + GitHub Copilot) needs to **justify the cost** of the
QA-orchestration work in the project. The product cannot answer this today:

- `qa-metrics` (`packages/core/src/model/skills.ts`) aggregates **quality only** — pass/fail/flakiness,
  acceptance-criterion coverage — never cost, tokens, or who did the work.
- The only token-counting precedent, `vscode/auditskill/.github/audit/scripts/count-tokens.mjs`
  (+ `_shared.mjs:getTiktoken`), measures the **static weight of configuration files**, not the real cost
  of a run.
- No **user identity** is captured anywhere (verified: `scaffold/`, `wizard/`, `cli.ts`, `types.ts` read no
  `git config`); the scaffold treats every run as anonymous.
- There is **no hook / telemetry / session-log** mechanism in the product — nothing captures per-invocation
  data. This epic **establishes that pattern**.

The goal is a **process cockpit** for the client that puts **AI cost ↔ delivered QA value** side by side:
cost logged **per user** (several people share one repo), grouped **by skill/agent** with a short
description of the task, and — the load-bearing framing — tied to **what was produced** via the existing
trace markers (`AC<n>` / `Traces to:` / `Covers:`) so the number reads as *value-for-money*, not a bill.

## Goals & non-goals

**Goals**
- Automatic, per-user capture of token/cost per skill/agent invocation, on **both** platforms.
- A committed, machine-readable log that several teammates append to safely.
- A self-contained, client-facing dashboard (`index.html` + data JSON) showing **cost per skill/agent (+
  description)** and **cost ↔ value (ROI)**.
- Honest labelling of data provenance (**real vs estimate**), consistent with the `grounding` rule.

**Non-goals**
- **Not** employee surveillance / a "ranking of people". Per-user data is framed as **license utilization**
  ("are the paid seats being used, and what do they deliver"), aggregated by default.
- **Not** a real-time observability platform / backend. File-based, no collector service.
- **Not** a billing system of record — it reconciles with real usage where the platform exposes it, and is
  transparent about estimates where it does not.

## Feasibility (grounded, verified 2026-07) — what each platform actually exposes

| Capability | Claude Code | GitHub Copilot (VS Code) |
|---|---|---|
| Per-invocation token/cost (real) | ✅ OTEL (`cost.usage`/`token.usage`, tagged `skill.name`, `model`), `/usage`, Agent SDK; local session usage data | ❌ none locally per-invocation |
| Skill/task attribution | ✅ (`skill.name` in OTEL, real-time) | ⚠️ **estimate only** — local chat logs (see below) carry text, not token counts |
| Write-a-file on session end | ✅ `SessionEnd` hook (+ `git config user.email`) | ❌ (no session hook; use VS Code task) |
| Local chat transcript (for estimator) | ✅ session data | ✅ `…/User/workspaceStorage/<hash>/chatSessions/*.json` (kind:0 meta+requests, kind:2 req/resp) — **but** the `<hash>` is fragile (changes on workspace rename / dev-container / added folders; known VS Code bugs orphan sessions) |
| **Real billed token/cost per user** | ✅ local usage data | ✅ **NEW (usage-based billing since 2026-06-01)** — GitHub billing REST: `…/settings/billing/ai_credit/usage` (per-**model** token qty + net cost), Copilot metrics per-user reports (`/orgs/{org}/copilot/metrics/reports/users-1-day`). **Per user + per model + per day**, ~daily lag, **org-admin token** (`manage_billing:copilot`) required; **not** per-skill/per-invocation |

**Consequence — corrected from the initial planning assumption, then scoped to this project.** Copilot is
**no longer** a flat per-seat subscription with no cost data: as of **2026-06-01 it bills by token
consumption** (input/output/cached) and GitHub exposes **real per-user, per-model cost/tokens via REST** —
but only to a holder of an **org-admin billing token** (`manage_billing:copilot`). **This project will never
have that token**, so in practice Copilot's real cost is **not reachable here**: Copilot is **estimator-only
by design**, and only **Claude** gets real-cost reconciliation (local usage, fine-grained, real-time). The
estimator is therefore the **sole** Copilot source (per-skill, real-time, from the fragile chat-log path)
and the fine-grained layer on Claude. The honest asymmetry is thus **availability in this project** (Claude
real vs Copilot estimate) — surfaced (not hidden) in the dashboard via the `source: real|estimate` flag. The
underlying REST capability is documented above only so the constraint is understood, not re-litigated.

## User-locked decisions

1. **Framing:** broader **process cockpit** (cost + quality); audience = **client**; goal = value-for-money.
2. **Output:** multi-file — one `index.html` (whole UI) **+** separate JSON data file(s), easy to embed;
   **self-contained** (inline CSS/JS), **no** Astro/three.js as a dependency (zero-dep ethos).
3. **Data source:** a shared **token estimator** (tiktoken cl100k / `chars/4` fallback, reusing the
   `auditskill/_shared.mjs` pattern) per-skill on **both** platforms, **reconciled with real cost/usage on
   Claude** (local usage data). Two methodologies (estimate vs billed) — **explicitly labelled**.
4. **Copilot:** estimator over **VS Code chat logs** (`…/workspaceStorage/<hash>/chatSessions/*.json`,
   best-effort — fragile `<hash>` → graceful degradation) for per-skill/real-time granularity. **Copilot is
   estimator-only, permanently.** Real billed-cost reconciliation from the GitHub billing/AI-credit + Copilot
   metrics REST API **is technically feasible** (Copilot moved to token-based usage billing on 2026-06-01 —
   see Feasibility) but is **out of scope**: this project will **never** have the required org-admin billing
   token (`manage_billing:copilot`). Only Claude gets real-cost reconciliation.
5. **Trigger:** a **fully automatic VS Code task** (`.vscode/tasks.json`, `runOn: folderOpen` + watch)
   running the capture script; covers both platforms (work happens in VS Code). Caveat: Claude Code from a
   pure CLI outside VS Code is not captured → optional git-hook backstop.
6. **User identity:** `git config user.email` (+ `user.name`), read by the capture script; per-user log.
7. **Log:** a new `context/telemetry/` area — `context/telemetry/<email-slug>.jsonl` (append-only, one
   record per session) + an aggregate `index.json`. JSON = the data files the dashboard reads.
8. **Core views:** **cost per skill/agent + description** and **cost ↔ value (ROI)** (cost per artifact /
   per covered AC, via the trace markers). Quality (`qa-metrics`) / trend / platform split live in the data
   and as an optional/secondary view, not the initial core.
9. **Generation:** a deterministic generator in `core/src/docs/` (the `skill-flows.ts` pattern) emits a
   static `index.html`, snapshot-tested (`npm run docs`); the JSON data is the only moving part.
10. **Charts:** hand-rolled **SVG + CSS** animations, self-contained, zero-dep.
11. **Privacy (GDPR):** the log is **committed**, with optional anonymization (`email` shortened/hashed);
    the dashboard aggregates by skill/ROI by default, never a "ranking of people".

## Data model

`context/telemetry/<email-slug>.jsonl` — one JSON object per session (append-only):

```
{
  "ts": "ISO-8601",
  "user": "email-or-hash",
  "platform": "claude" | "copilot",
  "skill": "qa-...",            // or agent name; best-effort on Copilot
  "description": "short task summary (from first user prompt)",
  "model": "claude-... | gpt-...",
  "tokens": { "input": n, "output": n, "cacheRead": n, "cacheCreation": n },
  "costUsd": number,
  "source": "real" | "estimate",   // load-bearing honesty flag
  "workId": "context/changes/<id>"  // when correlatable, for ROI
}
```

`context/telemetry/index.json` — the aggregate the dashboard consumes (rolled up per skill/agent, per user,
and — where `workId` is present — per artifact for the ROI view). Rebuilt by the capture script and/or the
`qa-cost` skill; never hand-edited.

## Capture architecture

A **zero-dep ESM** capture script (reusing `getTiktoken`/`estimateTokens`): identifies the user
(`git config`), locates the platform's transcript (Claude session data) / chat logs (Copilot, best-effort),
runs the estimator, on Claude **reconciles** with real local usage (replacing the estimate, flipping
`source` to `real`), extracts skill/agent + a short description, and appends a per-user record. A model
**pricing table** turns tokens into `costUsd`. The **VS Code auto-trigger** (`.vscode/tasks.json`) runs it
on folder-open + on a watch interval, so capture is automatic without a manual step.

## Dashboard

A deterministic generator (`core/src/docs/cost-dashboard.ts`) emits a self-contained `index.html`
(inline SVG + CSS, no external assets) that reads the sibling `index.json`. Core views: **cost per
skill/agent with descriptions** and **cost ↔ ROI** (cost per artifact / per covered AC, computed from the
trace markers). Every figure is tagged **real vs estimate**; Claude (fine-grained) and Copilot
(seat-level) are shown with their true granularity, never silently merged. Snapshot-tested via
`npm run docs` so the shipped UI can't drift.

## Parity & Copilot limits

Parity is structurally safe: the mechanism lives in `scaffold`/scripts and a shared `.vscode/tasks.json`
(not in an adapter), like the R-086/R-094 workspace wiring. The honest Copilot gap is now **granularity +
latency, not availability**: no per-*invocation* real data locally (estimator fills per-skill/real-time,
from the fragile chat-log path with graceful degradation), while **real billed cost is reconciled from the
GitHub billing REST API** (per-user/per-model/per-day, ~daily lag, org-admin token). Missing data never
breaks the run; the API path is opt-in (needs `manage_billing:copilot`).

## How to verify (pre-implementation spike)

Before building R-101, verify the two fragile Copilot assumptions empirically:

1. **Chat-log path & format** — inspect `%APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\*.json`
   on a real machine: confirm the record kinds (0/1/2), that request/response text is present, and that
   **no token counts** exist (→ estimator required). Reproduce the `<hash>` fragility (rename the
   `.code-workspace`, open in a dev-container) to size the graceful-degradation need.
2. **Claude real usage** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` with an OTLP/console exporter (or read local
   session usage); confirm `skill.name` / `cost.usage` attribution.

*(The GitHub billing/metrics API is not part of the spike — Copilot is estimator-only by design, see above.)*

If (1) proves too unstable on the target setup, Copilot degrades further (session-level estimate, or a
manual note) — the estimator is the only Copilot source, so its robustness is the load-bearing risk to size.

## Rollout

- **MVP (automatic, both platforms, estimate-based):** **R-100** (identity + data model) + **R-101**
  (capture + estimator) + **R-103** (VS Code auto-trigger) + **R-104** (dashboard generator). Delivers the
  automatic two-platform cockpit on estimates.
- **Phase 2 (enrichment):** **R-102** (real usage reconciliation **on Claude only** replaces the estimate;
  Copilot stays estimate-only) → **R-105** (`qa-cost` skill folds in quality + trace-based ROI; `doctor`
  checks; PRD/TECH/RUNNING docs + example test). Suite → **26 skills**.
- **Out of scope (recorded, not planned):** Copilot real-cost via the GitHub billing API. Technically
  feasible (token billing since 2026-06-01) but **the required org-admin token will never be available in
  this project**, so it is deliberately not a roadmap item. Documented here so it isn't re-proposed; Copilot
  is estimator-only by design.

## Sources

- Claude Code docs: costs / sessions / hooks / monitoring-with-OpenTelemetry / Agent SDK cost-tracking /
  settings / analytics (feasibility of per-skill, per-user token/cost capture).
- GitHub Copilot billing & metrics (verified 2026-07):
  - Usage-based billing (token consumption, 2026-06-01): <https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/>
  - Billing usage REST (`ai_credit/usage`, `premium_request/usage`, per-model/net cost): <https://docs.github.com/en/rest/billing/usage>
  - Copilot metrics API (per-user reports `users-1-day`/`users-28-day`, signed NDJSON): <https://docs.github.com/en/rest/copilot/copilot-metrics?apiVersion=2026-03-10>
  - VS Code chat sessions storage/format: <https://code.visualstudio.com/docs/copilot/chat/chat-sessions> · workspaceStorage `<hash>` fragility: microsoft/vscode issues #285059, #291897, #305818, #314799
- In-repo precedents: `vscode/auditskill/.github/audit/scripts/{count-tokens,_shared}.mjs`,
  `audit-config.yml` (`metrics_input.copilot_metrics_snapshot`), `packages/core/src/docs/skill-flows.ts`,
  `packages/core/src/model/{skills.ts (qa-metrics), mcp.ts (result servers)}`.
- Planning-session exploration (three agents: cost/metrics precedents, scaffold/context structure, harness
  telemetry capabilities).
