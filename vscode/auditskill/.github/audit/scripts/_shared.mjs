// Shared utilities for audit scripts: minimal frontmatter parser, glob walker, token estimator, YAML config loader.
// Vendored to keep the skill near zero-deps (gray-matter is optional; tiktoken is optional).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

let tiktokenEncoder = null;
let tiktokenAttempted = false;

async function getTiktoken() {
  if (tiktokenAttempted) return tiktokenEncoder;
  tiktokenAttempted = true;
  try {
    const mod = await import("tiktoken");
    tiktokenEncoder = mod.get_encoding("cl100k_base");
  } catch {
    tiktokenEncoder = null;
  }
  return tiktokenEncoder;
}

// Sync token estimate; uses cached tiktoken if previously loaded, else chars/4 fallback.
export function estimateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  if (tiktokenEncoder) {
    try {
      return tiktokenEncoder.encode(text).length;
    } catch {
      // fall through
    }
  }
  return Math.ceil(text.length / 4);
}

// Async warmup so the first sync call can use tiktoken if available.
export async function warmupTokenizer() {
  await getTiktoken();
  return tiktokenEncoder !== null;
}

// Minimal YAML frontmatter + body parser. Returns { frontmatter, body }.
// Supports: scalars, arrays (- item), nested mappings (2-space indent), single-line { } and [ ].
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const [, yaml, body] = match;
  return { frontmatter: parseYaml(yaml), body };
}

function parseYaml(src) {
  const lines = src.split(/\r?\n/);
  const root = {};
  // Stack entries: { indent, container } where container is the current object/array receiving children.
  const stack = [{ indent: -1, container: root }];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.match(/^( *)/)[1].length;
    const line = rawLine.slice(indent);

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];

    if (line.startsWith("- ")) {
      if (!Array.isArray(top.container)) continue;
      const value = line.slice(2).trim();
      const colonIdx = value.indexOf(":");
      const isInlineMapping =
        colonIdx >= 0 &&
        !value.match(/^["'].*["']$/) &&
        !value.match(/^https?:\/\//);
      if (isInlineMapping) {
        const obj = {};
        top.container.push(obj);
        stack.push({ indent, container: obj });
        const k = value.slice(0, colonIdx).trim();
        const v = value.slice(colonIdx + 1).trim();
        if (v === "") {
          const nested = nextStructure(lines, i + 1, indent);
          obj[k] = nested === "array" ? [] : {};
          stack.push({ indent: indent + 2, container: obj[k] });
        } else {
          obj[k] = coerce(v);
        }
      } else {
        top.container.push(coerce(value));
      }
      continue;
    }

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (Array.isArray(top.container)) continue;

    if (value === "") {
      const nested = nextStructure(lines, i + 1, indent);
      top.container[key] = nested === "array" ? [] : {};
      stack.push({ indent, container: top.container[key] });
    } else if (value.startsWith("[") && value.endsWith("]")) {
      top.container[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => coerce(s.trim()))
        .filter((s) => s !== "");
    } else {
      top.container[key] = coerce(value);
    }
  }

  return root;
}

function nextStructure(lines, fromIdx, parentIndent) {
  for (let i = fromIdx; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = l.match(/^( *)/)[1].length;
    if (ind <= parentIndent) return "object";
    return l.slice(ind).startsWith("- ") ? "array" : "object";
  }
  return "object";
}

function coerce(value) {
  if (value === "") return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// Minimal YAML config loader for audit-config.yml (uses parseYaml).
export function loadConfig(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  return parseYaml(raw);
}

// Walks the filesystem and matches against simple glob patterns.
// Supports **, *, and ? in path segments. No brace expansion or negation.
export function walkGlobs(root, patterns) {
  const matched = new Set();
  for (const pattern of patterns) {
    const regex = globToRegex(pattern);
    walk(root, "", regex, matched);
  }
  return [...matched].sort();
}

function globToRegex(pattern) {
  // Normalize separators
  const p = pattern.replace(/\\/g, "/");
  let re = "^";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      re += ".*";
      i++;
      if (p[i + 1] === "/") i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if (c === "/") {
      re += "/";
    } else if (/[a-zA-Z0-9_-]/.test(c)) {
      re += c;
    } else {
      re += "\\" + c;
    }
  }
  re += "$";
  return new RegExp(re);
}

function walk(root, sub, regex, matched) {
  const abs = join(root, sub);
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const relPath = sub ? `${sub}/${entry}` : entry;
    const absEntry = join(root, relPath);
    let st;
    try {
      st = statSync(absEntry);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(root, relPath, regex, matched);
    } else if (regex.test(relPath.replace(/\\/g, "/"))) {
      matched.add(relPath.replace(/\\/g, "/"));
    }
  }
}

// Latest file by timestamp pattern (e.g. scan-*.json). Returns absolute path or null.
export function findLatest(dir, prefix, suffix) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .sort();
  return entries.length ? join(dir, entries[entries.length - 1]) : null;
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
