#!/usr/bin/env node
// Parses .github/agents/*.agent.md and .github/chatmodes/*.chatmode.md.
// Emits JSON describing each agent: frontmatter fields + which declared tools are mentioned in body.
//
// Usage: node parse-agents.mjs [--root <path>] [--config <path>]

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, parseFrontmatter, estimateTokens, walkGlobs, warmupTokenizer } from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    config: { type: "string", default: ".github/audit/audit-config.yml" },
  },
});

await warmupTokenizer();

const root = values.root;
const config = loadConfig(join(root, values.config));
const agentGlobs = config.glob_patterns?.agents ?? [
  ".github/agents/**/*.agent.md",
  ".github/chatmodes/**/*.chatmode.md",
];

const files = walkGlobs(root, agentGlobs);

const agents = files.map((file) => {
  const abs = join(root, file);
  const raw = readFileSync(abs, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const declaredTools = normalizeArray(frontmatter.tools);
  const declaredAgents = normalizeArray(frontmatter.agents);
  const handoffs = Array.isArray(frontmatter.handoffs) ? frontmatter.handoffs : [];

  const toolsUsedInBody = declaredTools.filter((t) => {
    if (t === "*") return true;
    const re = new RegExp(`\\b${escapeRe(t)}\\b`, "i");
    if (re.test(body)) return true;
    return handoffs.some((h) => typeof h?.prompt === "string" && re.test(h.prompt));
  });

  const handoffPromptTokens = handoffs
    .map((h) => (typeof h?.prompt === "string" ? estimateTokens(h.prompt) : 0))
    .reduce((a, b) => a + b, 0);

  return {
    name: frontmatter.name ?? deriveName(file),
    file: file.replace(/\\/g, "/"),
    description: frontmatter.description ?? null,
    model: frontmatter.model ?? null,
    target: frontmatter.target ?? null,
    user_invokable: frontmatter["user-invokable"] ?? true,
    declared_tools: declaredTools,
    declared_tools_count: declaredTools.length,
    tools_used_in_body: toolsUsedInBody,
    unused_tools: declaredTools.filter((t) => t !== "*" && !toolsUsedInBody.includes(t)),
    declared_subagents: declaredAgents,
    handoffs_count: handoffs.length,
    handoffs_targets: handoffs.map((h) => h?.agent).filter(Boolean),
    handoff_prompt_tokens: handoffPromptTokens,
    body_tokens: estimateTokens(body),
    frontmatter_tokens: estimateTokens(raw) - estimateTokens(body),
    body_lines: body.split("\n").length,
  };
});

// Orchestration graph: who can call whom.
const edges = [];
for (const a of agents) {
  for (const sub of a.declared_subagents) {
    if (sub === "*") continue;
    edges.push({ from: a.name, to: sub, kind: "subagent" });
  }
  for (const target of a.handoffs_targets) {
    edges.push({ from: a.name, to: target, kind: "handoff" });
  }
}

const cycles = detectCycles(edges);

process.stdout.write(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      root,
      agents,
      orchestration: { edges, cycles },
    },
    null,
    2,
  ),
);

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function deriveName(file) {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.(agent|chatmode)\.md$/i, "");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectCycles(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const node of adj.keys()) color.set(node, WHITE);

  function dfs(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        if (cycleStart >= 0) cycles.push([...stack.slice(cycleStart), next]);
      } else if (c === WHITE) {
        dfs(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of adj.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node, []);
  }
  return cycles;
}
