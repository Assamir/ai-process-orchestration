#!/usr/bin/env node
// Detects near-duplicate MD content across instruction/prompt/agent files using shingles + Jaccard.
//
// Usage: node detect-duplicates.mjs [--root <path>] [--config <path>] [--shingle-size 5]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, walkGlobs, estimateTokens, warmupTokenizer, parseFrontmatter } from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    config: { type: "string", default: ".github/audit/audit-config.yml" },
    "shingle-size": { type: "string", default: "5" },
  },
});

await warmupTokenizer();

const root = values.root;
const config = loadConfig(join(root, values.config));
const threshold = Number(config.thresholds?.doc_duplication_jaccard ?? 0.6);
const shingleSize = parseInt(values["shingle-size"], 10);

const groupsToScan = ["instructions", "prompts", "agents"];
const files = [];
for (const g of groupsToScan) {
  const patterns = config.glob_patterns?.[g];
  if (!Array.isArray(patterns)) continue;
  for (const f of walkGlobs(root, patterns)) files.push(f);
}

const docs = files.map((f) => {
  const raw = readFileSync(join(root, f), "utf8");
  const { body } = parseFrontmatter(raw);
  const text = body || raw;
  return { path: f.replace(/\\/g, "/"), shingles: shingle(text, shingleSize), tokens: estimateTokens(text) };
});

const pairs = [];
for (let i = 0; i < docs.length; i++) {
  for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i];
    const b = docs[j];
    const jac = jaccard(a.shingles, b.shingles);
    if (jac >= threshold) {
      const shared = approxSharedTokens(a, b, jac);
      pairs.push({
        a: a.path,
        b: b.path,
        jaccard: Number(jac.toFixed(3)),
        estimated_shared_tokens: shared,
      });
    }
  }
}

pairs.sort((x, y) => y.estimated_shared_tokens - x.estimated_shared_tokens);

process.stdout.write(
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      root,
      threshold,
      shingle_size: shingleSize,
      file_count: docs.length,
      pair_count: pairs.length,
      pairs,
    },
    null,
    2,
  ),
);

function shingle(text, n) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźżäöüß\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of smaller) if (larger.has(s)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function approxSharedTokens(a, b, jac) {
  // Estimate: smaller doc's tokens * jaccard
  const minTokens = Math.min(a.tokens, b.tokens);
  return Math.round(minTokens * jac);
}
