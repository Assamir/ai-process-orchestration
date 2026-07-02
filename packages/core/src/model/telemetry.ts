/**
 * R-100 — the **telemetry data model**: the single source of shape for the AI
 * cost & value cockpit (epic R-100 → R-105). It defines where telemetry lives
 * (`context/telemetry/`), how a developer identity becomes a per-user log file,
 * how token counts become a USD cost (the pricing table, R-101/R-102), and how
 * the append-only per-user JSONL records roll up into the aggregate `index.json`
 * the dashboard reads (R-104).
 *
 * Pure and dependency-light (only `node:crypto` for the opt-in email hash), so it
 * is imported by the scaffold (seeds the area), `doctor` (structure check), the
 * dashboard generator (renders the aggregate), and the tests. The **capture
 * script** (R-101) is a zero-dep ESM module that ships into the target repo and
 * therefore re-implements the same record shape / pricing / aggregation
 * standalone (it can't import bundled `core`); this module is the authoritative
 * copy the script mirrors, and `tests/telemetry.test.ts` pins the contract.
 */
import { createHash } from "node:crypto";
import type { TelemetryRecord, TelemetryTokens } from "../types.js";

export type { TelemetryRecord, TelemetryTokens } from "../types.js";

/** The committed telemetry area, repo-root-relative (POSIX). */
export const TELEMETRY_DIR = "context/telemetry";
/** The aggregate the dashboard reads (rebuilt by the capture script / `qa-cost`). */
export const TELEMETRY_INDEX_REL = `${TELEMETRY_DIR}/index.json`;

/**
 * (R-101/R-102) Per-model USD pricing, in **dollars per million tokens**, split
 * so cached input is priced below fresh input (both platforms bill it cheaper).
 * Matched by longest key prefix (`priceFor`), so `claude-opus-4-8-2026…` resolves
 * to the `claude-opus-4` entry. A model with no match falls back to `default` — a
 * mid-range rate — so an unknown/new model still produces a (flagged-estimate)
 * cost rather than zero. Rates are the estimator's assumption, not a billed truth;
 * that is exactly why every estimate record is tagged `source: "estimate"`.
 */
export interface ModelPrice {
  /** USD per 1M fresh input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cache-read tokens. */
  cacheRead: number;
  /** USD per 1M cache-write (creation) tokens. */
  cacheCreation: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // Claude (Anthropic) — dollars per 1M tokens.
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-haiku-4": { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
  "claude-fable-5": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  // GitHub Copilot / OpenAI family — dollars per 1M tokens.
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheCreation: 2.5 },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheCreation: 2 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125, cacheCreation: 1.25 },
  "o4-mini": { input: 1.1, output: 4.4, cacheRead: 0.275, cacheCreation: 1.1 },
  // Fallback for an unmatched / future model — a mid-range rate.
  default: { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
};

/** Resolve the pricing for a model id by longest matching key prefix, else `default`. */
export function priceFor(model: string): ModelPrice {
  const id = (model || "").toLowerCase();
  let best: string | null = null;
  for (const key of Object.keys(PRICING)) {
    if (key === "default") continue;
    if (id.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  return PRICING[best ?? "default"]!;
}

/** Cost in USD for a token split under a model's pricing, rounded to 6 decimals. */
export function costUsd(model: string, tokens: TelemetryTokens): number {
  const p = priceFor(model);
  const usd =
    (tokens.input * p.input +
      tokens.output * p.output +
      tokens.cacheRead * p.cacheRead +
      tokens.cacheCreation * p.cacheCreation) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * (R-100) Slugify a developer email into a filesystem-safe per-user log basename:
 * lowercase, non-alphanumerics collapsed to `-`, trimmed. `a.b@corp.com` →
 * `a-b-corp-com`. Empty / missing email → `unknown`.
 */
export function emailSlug(email: string): string {
  const s = (email || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "unknown";
}

/**
 * (R-100/R-111 privacy) A short, stable one-way hash of an email for the anonymized
 * mode — `sha256(email)` truncated to 12 hex chars, prefixed `anon-`. Not reversible;
 * stable so the same person's records still group together without exposing who.
 */
export function anonymizeEmail(email: string): string {
  const h = createHash("sha256").update((email || "").toLowerCase(), "utf8").digest("hex");
  return `anon-${h.slice(0, 12)}`;
}

/** The recorded user identity for a record, honoring the anonymization choice. */
export function recordUser(email: string, anonymize: boolean): string {
  return anonymize ? anonymizeEmail(email) : (email || "unknown");
}

// --- aggregation: JSONL records → the dashboard's index.json ------------------

/** Roll-up totals over a set of records. */
export interface TelemetrySummary {
  records: number;
  costUsd: number;
  tokens: number;
  /** How many records are billed/observed vs estimated — the honesty split. */
  real: number;
  estimate: number;
}

/** One aggregation bucket (by skill / user / platform / work-item). */
export interface TelemetryGroup extends TelemetrySummary {
  key: string;
  /** A representative task description (the most recent), for the skill/agent view. */
  description?: string;
}

/**
 * (R-104) The aggregate the dashboard consumes — rolled up per skill/agent, per
 * user, per platform, and (for the ROI view) per work-item. Rebuilt from the
 * per-user JSONL logs by the capture script and/or `qa-cost`; never hand-edited.
 * Deterministic given its input (stable key sort), so the seeded empty aggregate
 * and the dashboard snapshot stay stable.
 */
export interface TelemetryIndex {
  schemaVersion: 1;
  totals: TelemetrySummary;
  bySkill: TelemetryGroup[];
  byUser: TelemetryGroup[];
  byPlatform: TelemetryGroup[];
  /** ROI dimension: cost grouped by the work-item it produced (records with `workId`). */
  byWorkId: TelemetryGroup[];
}

function emptySummary(): TelemetrySummary {
  return { records: 0, costUsd: 0, tokens: 0, real: 0, estimate: 0 };
}

function tokenTotal(t: TelemetryTokens): number {
  return t.input + t.output + t.cacheRead + t.cacheCreation;
}

function addTo(s: TelemetrySummary, r: TelemetryRecord): void {
  s.records += 1;
  s.costUsd += r.costUsd;
  s.tokens += tokenTotal(r.tokens);
  if (r.source === "real") s.real += 1;
  else s.estimate += 1;
}

function round(s: TelemetrySummary): void {
  s.costUsd = Math.round(s.costUsd * 1e6) / 1e6;
}

function groupBy(
  records: TelemetryRecord[],
  keyOf: (r: TelemetryRecord) => string | undefined,
): TelemetryGroup[] {
  const map = new Map<string, TelemetryGroup>();
  for (const r of records) {
    const key = keyOf(r);
    if (key === undefined || key === "") continue;
    let g = map.get(key);
    if (!g) {
      g = { key, ...emptySummary() };
      map.set(key, g);
    }
    addTo(g, r);
    if (r.description) g.description = r.description; // most-recent wins (input is chronological)
  }
  const out = [...map.values()];
  for (const g of out) round(g);
  // Deterministic: highest cost first, ties broken by key.
  out.sort((a, b) => b.costUsd - a.costUsd || a.key.localeCompare(b.key));
  return out;
}

/** Roll a flat list of records up into the {@link TelemetryIndex} the dashboard reads. */
export function aggregateRecords(records: TelemetryRecord[]): TelemetryIndex {
  const totals = emptySummary();
  for (const r of records) addTo(totals, r);
  round(totals);
  return {
    schemaVersion: 1,
    totals,
    bySkill: groupBy(records, (r) => r.skill),
    byUser: groupBy(records, (r) => r.user),
    byPlatform: groupBy(records, (r) => r.platform),
    byWorkId: groupBy(records, (r) => r.workId),
  };
}

/** The seeded (empty) aggregate written at scaffold time before any capture runs. */
export function seedIndex(): TelemetryIndex {
  return aggregateRecords([]);
}

/** The seeded `index.json` file content (pretty-printed, trailing newline). */
export const TELEMETRY_INDEX_SEED = `${JSON.stringify(seedIndex(), null, 2)}\n`;

/**
 * The seeded `context/telemetry/README.md` — explains the area, the record shape,
 * the real-vs-estimate honesty flag, and the privacy stance. No relative links
 * (so it can't trip `doctor`'s broken-link check) and no `{{PLACEHOLDER}}` markers.
 */
export const TELEMETRY_README = `# Telemetry — AI cost & value cockpit

> Committed, machine-readable log of what the AI-assisted QA work **cost** (tokens
> and USD, per user, per skill/agent) and what it **produced** (tied to work-items
> via the trace markers). Feeds the self-contained dashboard \`dashboard.html\`,
> which reads the aggregate \`index.json\`. Generated by the QA-process scaffolder.

## What lives here

- \`<email-slug>.jsonl\` — one append-only record per AI session, per user. Written
  by the capture script; never hand-edited.
- \`index.json\` — the aggregate the dashboard reads (rolled up per skill, user,
  platform, and work-item). Rebuilt by the capture script; never hand-edited.
- \`capture.mjs\` — the zero-dependency capture script (run automatically by the
  VS Code task; see \`.vscode/tasks.json\`).
- \`dashboard.html\` — the self-contained, client-facing cockpit. Open it over a
  local web server (it reads the sibling \`index.json\`).

## Automatic capture

A VS Code task (\`.vscode/tasks.json\`, \`qa-telemetry-capture\`) runs the capture
script on folder open, so cost is captured for both platforms without a manual
step. For Claude Code sessions run from a pure CLI outside VS Code, add a git-hook
backstop — a \`post-commit\` hook that runs the same script:

    #!/bin/sh
    node context/telemetry/capture.mjs >/dev/null 2>&1 || true

You can also run it by hand at any time: \`node context/telemetry/capture.mjs\`.

## Record shape

Each JSONL line is one session:

    { "ts", "user", "platform", "skill", "description", "model",
      "tokens": { "input", "output", "cacheRead", "cacheCreation" },
      "costUsd", "source": "real" | "estimate", "workId"? }

## Honesty: real vs estimate

Every figure is tagged \`source\`. On **Claude** cost is reconciled against real
local usage where available (\`real\`); on **Copilot** it is always a tokenizer
**estimate** (\`estimate\`) — the two methodologies are shown distinctly and never
silently merged. This mirrors the grounding rule: a number you can't observe is
labelled, not hidden.

## Privacy

Aggregated by skill and ROI by default — this is **license utilization** ("are the
paid seats delivering value?"), not a ranking of people. Set the anonymization
option at install to record a one-way hash of each email instead of the address.
`;

/**
 * The per-user JSONL log basename for an email under the current anonymization
 * choice — e.g. \`a-b-corp-com.jsonl\` or \`anon-1a2b3c4d5e6f.jsonl\`.
 */
export function userLogRel(email: string, anonymize: boolean): string {
  const id = anonymize ? anonymizeEmail(email) : emailSlug(email);
  return `${TELEMETRY_DIR}/${id}.jsonl`;
}

// --- R-103: VS Code auto-trigger ---------------------------------------------

/** The `.vscode/tasks.json`, repo-root-relative. */
export const VSCODE_TASKS_REL = ".vscode/tasks.json";
/** The label identifying our capture task inside `tasks.json` (dedup / doctor key). */
export const CAPTURE_TASK_LABEL = "qa-telemetry-capture";

/**
 * (R-103) The VS Code task that runs the capture script automatically — on folder
 * open (so every session that happened since the last open is captured) as a
 * quiet background task. Covers **both** platforms because the QA work happens in
 * VS Code. A pure-CLI Claude session outside VS Code is caught by the optional
 * git-hook backstop documented in the telemetry README.
 */
export function captureTask(): Record<string, unknown> {
  return {
    label: CAPTURE_TASK_LABEL,
    type: "process",
    command: "node",
    args: [`${TELEMETRY_DIR}/capture.mjs`],
    runOptions: { runOn: "folderOpen" },
    isBackground: true,
    presentation: { reveal: "never", panel: "dedicated", close: true },
    problemMatcher: [],
  };
}

/** The seeded `.vscode/tasks.json` object when the repo has none yet. */
export function vscodeTasksSeed(): Record<string, unknown> {
  return { version: "2.0.0", tasks: [captureTask()] };
}
