import type { LogicalSkill } from "../model/skills.js";

/**
 * Documentation generator (R-052) — turns the platform-agnostic skill suite in
 * `model/skills.ts` into a Mermaid **skill catalog**: a per-skill usage flow for
 * every skill (trigger/inputs → key procedure steps → artifacts → `## Next`
 * skills) plus the aggregate flows (two-phase install, the daily work-item loop,
 * the skill-orchestration graph with lifecycle swimlanes, detection/wizard/MCP
 * wiring).
 *
 * It only **reads** `skills.ts`; it ships nothing into target repos or generated
 * `SKILL.md`s, so it has **no parity impact**. The output is deterministic (no
 * dates, no randomness) so a committed `docs/skill-catalog.md` can be
 * snapshot-verified against this generator — a future skill auto-appears and the
 * docs can never silently drift (`tests/skill-flows.test.ts`).
 *
 * Every rendered diagram is wrapped in the `@formatter:off` / `@formatter:on`
 * guards from the `code-formatting` standard (R-054), so the catalog is itself
 * born compliant.
 */

const GUARD_OPEN = "<!-- @formatter:off -->";
const GUARD_CLOSE = "<!-- @formatter:on -->";
const FENCE = "```";

const BUCKETS: ReadonlyArray<{ key: LogicalSkill["bucket"]; title: string; lifecycle: string }> = [
  { key: "backbone", title: "Backbone — process & context", lifecycle: "Planning & process" },
  { key: "design", title: "Test design", lifecycle: "Authoring" },
  { key: "automation", title: "Automation", lifecycle: "Automation & CI" },
  { key: "analysis", title: "Analysis & data", lifecycle: "Analysis & data" },
];

const MODEL_NOTE: Record<LogicalSkill["suggestedModel"], string> = {
  opus: "heavy reasoning",
  sonnet: "balanced",
  haiku: "mechanical",
};

// --- text + Mermaid-label sanitization -------------------------------------

/** Make an arbitrary string safe inside a Mermaid `["..."]` quoted label. */
function clean(s: string): string {
  return s
    .replace(/[`*]/g, "")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** A stable Mermaid node id for a skill name (`qa-rca` → `qa_rca`). */
function nodeId(name: string): string {
  return name.replace(/-/g, "_");
}

// --- metadata parsers (the structured truth read out of each body) ----------

/** Pull a named `## Section` body (up to the next `## `), or "". */
function section(body: string, heading: string): string {
  const after = body.split(new RegExp(`^## ${heading}\\b`, "m"))[1];
  if (after === undefined) return "";
  return after.split(/^## /m)[0]!.trim();
}

/** The skills a skill hands off to, in `## Next` order, filtered to real skills. */
export function nextSkills(skill: LogicalSkill, valid: ReadonlySet<string>): string[] {
  const seg = section(skill.body, "Next");
  const out: string[] = [];
  for (const m of seg.matchAll(/`(qa-[a-z0-9-]+)`/g)) {
    const name = m[1]!;
    if (valid.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The first sentence of `## When to use` — the skill's trigger. */
export function triggerLine(skill: LogicalSkill): string {
  const seg = section(skill.body, "When to use");
  const first = seg
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const sentence = (first ?? skill.description).split(/(?<=[.!?])\s/)[0]!;
  return truncate(clean(sentence), 64);
}

/** Short labels for the numbered `## Procedure` steps (a leading **bold** lead, else the first clause). */
export function procedureSteps(skill: LogicalSkill): string[] {
  const seg = section(skill.body, "Procedure");
  const steps: string[] = [];
  for (const m of seg.matchAll(/^\s*\d+\.\s+(.*)$/gm)) {
    const raw = m[1]!.trim();
    // A *leading* bold phrase is the step's own title; a mid-sentence bold (e.g. a
    // `{{PLACEHOLDER}}`) is not — only use the bold lead when the step opens with it.
    const lead = raw.match(/^\*\*(.+?)\*\*/);
    const label = lead ? lead[1]! : raw.split(/[.:;—]/)[0]!;
    steps.push(truncate(clean(label), 52));
  }
  return steps;
}

// --- per-skill flowchart -----------------------------------------------------

/**
 * One Mermaid flowchart for a skill: trigger + inputs (`reads`) → the procedure
 * spine → artifacts (`writes`) + the `## Next` hand-offs. Returns the guarded,
 * fenced block (no surrounding prose).
 */
export function renderSkillFlow(skill: LogicalSkill, valid: ReadonlySet<string>): string {
  const id = nodeId(skill.name);
  const mode = skill.readOnly ? "read-only" : "write";
  const steps = procedureSteps(skill);
  const next = nextSkills(skill, valid);

  const lines: string[] = ["flowchart TD"];
  lines.push(`  trig["▶ ${triggerLine(skill)}"]`);
  lines.push(`  ${id}["${skill.name}<br/>${skill.suggestedModel} · ${mode}"]`);
  lines.push(`  trig --> ${id}`);

  // Inputs feed the skill.
  skill.reads.forEach((r, i) => {
    lines.push(`  r${i}[("reads: ${truncate(clean(r), 40)}")]`);
    lines.push(`  r${i} --> ${id}`);
  });

  // Procedure spine hangs off the skill node.
  let tail = id;
  steps.forEach((st, i) => {
    lines.push(`  s${i}["${i + 1}. ${st}"]`);
    lines.push(`  ${tail} --> s${i}`);
    tail = `s${i}`;
  });

  // Artifacts produced + next-skill hand-offs come off the tail.
  skill.writes.forEach((w, i) => {
    lines.push(`  w${i}[("writes: ${truncate(clean(w), 40)}")]`);
    lines.push(`  ${tail} --> w${i}`);
  });
  next.forEach((n) => {
    lines.push(`  ${tail} -->|next| ${nodeId(n)}["${n}"]`);
  });

  return guarded(lines.join("\n"));
}

/** Wrap a Mermaid diagram body in a fenced block + the R-054 formatter guards. */
function guarded(mermaid: string): string {
  return `${GUARD_OPEN}\n${FENCE}mermaid\n${mermaid}\n${FENCE}\n${GUARD_CLOSE}`;
}

// --- aggregate flows ---------------------------------------------------------

/**
 * The whole-suite orchestration graph: each bucket is a `subgraph` swimlane
 * (planning / authoring / automation / analysis), and every `## Next` edge is
 * drawn — the complete hand-off map encoded in the suite itself (R-020).
 */
export function renderOrchestrationGraph(skills: readonly LogicalSkill[]): string {
  const valid = new Set(skills.map((s) => s.name));
  const lines: string[] = ["flowchart LR"];
  for (const b of BUCKETS) {
    lines.push(`  subgraph ${b.key}["${b.lifecycle}"]`);
    for (const s of skills.filter((x) => x.bucket === b.key)) {
      lines.push(`    ${nodeId(s.name)}["${s.name}"]`);
    }
    lines.push("  end");
  }
  for (const s of skills) {
    for (const n of nextSkills(s, valid)) {
      lines.push(`  ${nodeId(s.name)} --> ${nodeId(n)}`);
    }
  }
  return guarded(lines.join("\n"));
}

/** Static: the deterministic phase-1 installer → in-tool phase-2 fill. */
const TWO_PHASE_FLOW = guarded(
  [
    "flowchart LR",
    '  cli["npx <pkg> init<br/>(deterministic, no LLM)"]',
    '  cli --> det["detect stack"]',
    '  det --> wiz["wizard / --yes"]',
    '  wiz --> scaffold["write root map + context/<br/>+ skills + MCP + manifest"]',
    '  scaffold --> ph2["phase 2 — in the tool (LLM)"]',
    '  ph2 --> init["run qa-init"]',
    '  init --> filled["fill {{PLACEHOLDER}} markers"]',
  ].join("\n"),
);

/** Static: the daily work-item loop (state of record = context/). */
const DAILY_LOOP_FLOW = guarded(
  [
    "flowchart LR",
    "  new[qa-new] --> ticket[qa-ticket-review]",
    "  ticket --> plan[qa-test-plan]",
    "  plan --> design[qa-test-case-design]",
    "  design --> automate[qa-test-automate]",
    "  automate --> run{{run tests}}",
    "  run -->|pass| review[qa-review]",
    "  run -->|fail| rca[qa-rca]",
    "  rca --> automate",
    "  rca -->|product defect| bug[qa-bug-report]",
    "  review --> archive[qa-archive]",
  ].join("\n"),
);

/** Static: phase-1 detection → wizard → config + result/ticket/browser MCP wiring. */
const WIRING_FLOW = guarded(
  [
    "flowchart TD",
    '  repo[("target repo")] --> detect["detect: language / build tool /<br/>frameworks / linters / observability / performance"]',
    "  detect --> wizard[\"wizard: framework, report language,<br/>autonomy, opt-in MCP servers\"]",
    '  wizard --> root["root map + .ai/guidelines + context/"]',
    '  wizard --> mcp["MCP config (.mcp.json / .vscode/mcp.json)"]',
    '  mcp --> results["result MCP (playwright/pytest/jvm/allure/jmeter)"]',
    '  mcp -.opt-in.-> browser["@playwright/mcp browser"]',
    '  mcp -.opt-in.-> jira["local atlassian (Jira + Confluence)"]',
  ].join("\n"),
);

// --- the full catalog --------------------------------------------------------

/**
 * The complete `docs/skill-catalog.md`. Deterministic — snapshot-verified
 * against the committed file so it can never drift and a new skill auto-appears.
 */
export function renderSkillCatalog(skills: readonly LogicalSkill[]): string {
  const valid = new Set(skills.map((s) => s.name));
  const out: string[] = [];

  out.push("# QA orchestration — skill catalog");
  out.push("");
  out.push(
    "> **Auto-generated** from `packages/core/src/model/skills.ts` by " +
      "`packages/core/src/docs/skill-flows.ts` (R-052). **Do not edit by hand** — " +
      "the snapshot test `packages/core/tests/skill-flows.test.ts` fails on drift; " +
      "regenerate with `npm run docs`. Every diagram is wrapped in `@formatter:off` / " +
      "`@formatter:on` guards (R-054) so an autoformatter can't reflow it.",
  );
  out.push("");
  out.push(
    `The suite ships **${skills.length} skills** in four buckets (read-only skills get no write ` +
      "tools). Each skill names its recommended successors in a `## Next` section; those hand-offs " +
      "form the orchestration graph below.",
  );
  out.push("");

  out.push("## How the suite fits together");
  out.push("");
  out.push("The complete hand-off map — each bucket is a lifecycle swimlane, each edge a `## Next` hand-off:");
  out.push("");
  out.push(renderOrchestrationGraph(skills));
  out.push("");

  out.push("## The two-phase install");
  out.push("");
  out.push("Phase 1 is a 100% deterministic `npx` installer (no LLM); phase 2 runs in the tool and fills the markers:");
  out.push("");
  out.push(TWO_PHASE_FLOW);
  out.push("");

  out.push("## The daily work-item loop");
  out.push("");
  out.push("State of record lives under `context/` — read it before acting, update it after:");
  out.push("");
  out.push(DAILY_LOOP_FLOW);
  out.push("");

  out.push("## Detection, wizard & MCP wiring");
  out.push("");
  out.push("How phase 1 detects the stack and wires the (read-only) result MCP plus the opt-in browser / ticketing servers:");
  out.push("");
  out.push(WIRING_FLOW);
  out.push("");

  out.push(`## Skills (${skills.length})`);
  out.push("");
  for (const b of BUCKETS) {
    const inBucket = skills.filter((s) => s.bucket === b.key);
    out.push(`### ${b.title}`);
    out.push("");
    for (const s of inBucket) {
      out.push(`#### \`${s.name}\`${s.readOnly ? " *(read-only)*" : ""}`);
      out.push("");
      out.push(s.description);
      out.push("");
      const reads = s.reads.length > 0 ? s.reads.map((r) => `\`${r}\``).join(", ") : "—";
      const writes = s.writes.length > 0 ? s.writes.map((w) => `\`${w}\``).join(", ") : "—";
      const next = nextSkills(s, valid);
      out.push(
        `- **Model:** ${s.suggestedModel} (${MODEL_NOTE[s.suggestedModel]}) · ` +
          `**Mode:** ${s.readOnly ? "read-only" : "write"}`,
      );
      out.push(`- **Reads:** ${reads}`);
      out.push(`- **Writes:** ${writes}`);
      out.push(`- **Next:** ${next.length > 0 ? next.map((n) => `\`${n}\``).join(" → ") : "—"}`);
      out.push("");
      out.push(renderSkillFlow(s, valid));
      out.push("");
    }
  }

  return `${out.join("\n").trimEnd()}\n`;
}
