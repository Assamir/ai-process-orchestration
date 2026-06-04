#!/usr/bin/env node
// Counts tokens (cl100k_base via tiktoken, fallback chars/4) for every file matching the configured globs.
// Aggregates by group (instructions, prompts, agents, mcp).
//
// Usage: node count-tokens.mjs [--root <path>] [--config <path>]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, estimateTokens, walkGlobs, warmupTokenizer } from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    config: { type: "string", default: ".github/audit/audit-config.yml" },
  },
});

const usedTiktoken = await warmupTokenizer();

const root = values.root;
const config = loadConfig(join(root, values.config));
const globGroups = config.glob_patterns ?? {};

const groups = {};
let grandTotal = 0;
const allFiles = [];

for (const [groupName, patterns] of Object.entries(globGroups)) {
  if (!Array.isArray(patterns)) continue;
  const files = walkGlobs(root, patterns);
  let groupTotal = 0;
  const fileEntries = [];
  for (const f of files) {
    let raw;
    try {
      raw = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    const tokens = estimateTokens(raw);
    const chars = raw.length;
    fileEntries.push({ path: f.replace(/\\/g, "/"), tokens, chars });
    groupTotal += tokens;
    allFiles.push({ group: groupName, path: f.replace(/\\/g, "/"), tokens, chars });
  }
  groups[groupName] = { total_tokens: groupTotal, file_count: fileEntries.length, files: fileEntries };
  grandTotal += groupTotal;
}

process.stdout.write(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      root,
      tokenizer: usedTiktoken ? "tiktoken-cl100k" : "chars-div-4",
      total_tokens: grandTotal,
      groups,
      all_files: allFiles,
    },
    null,
    2,
  ),
);
