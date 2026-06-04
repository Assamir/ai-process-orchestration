#!/usr/bin/env node
// Applies a single OPT-### step from an audit report.
//
// The report's OPT section must include a fenced code block tagged `action` containing a JSON object
// describing a structured action. Supported actions:
//
//   { "type": "delete_lines", "file": "path.md", "from": 42, "to": 67 }
//   { "type": "replace_frontmatter_field", "file": "agent.agent.md", "field": "tools", "value": ["a","b","c"] }
//   { "type": "extract_section", "from": "a.md", "to": "shared.md", "section_heading": "## Common rules" }
//
// Usage:
//   node apply-step.mjs --id OPT-001 --report .github/audit/audit-report-<ts>.md [--root .] [--dry-run|--write] [--force]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseArgs } from "node:util";
import { parseFrontmatter } from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    report: { type: "string" },
    root: { type: "string", default: "." },
    "dry-run": { type: "boolean", default: false },
    write: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

if (!values.id || !values.report) {
  fail("--id OPT-### and --report <path> are required");
}
if (values["dry-run"] === values.write) {
  fail("specify exactly one of --dry-run or --write");
}

const reportPath = values.report;
const reportRaw = readFileSync(reportPath, "utf8");

const { section, risk, action } = extractStep(reportRaw, values.id);

if (risk === "high" && !values.force) {
  fail(`OPT ${values.id} has risk: high; pass --force to apply anyway`);
}

const result = values["dry-run"] ? dryRun(action) : writeAction(action);

process.stdout.write(
  JSON.stringify(
    {
      id: values.id,
      mode: values["dry-run"] ? "dry-run" : "write",
      risk,
      action,
      result,
    },
    null,
    2,
  ),
);

if (values.write) {
  const updated = flipCheckbox(reportRaw, values.id);
  writeFileSync(reportPath, updated, "utf8");
}

// --- helpers ---

function extractStep(raw, id) {
  const re = new RegExp(`### ${escapeRe(id)}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const m = raw.match(re);
  if (!m) fail(`step ${id} not found in report`);
  const section = m[0];
  const risk = (section.match(/\*\*Risk:\*\*\s*(low|medium|high)/i) || [])[1]?.toLowerCase() ?? "medium";
  const actionMatch = section.match(/```action\s*([\s\S]*?)```/);
  if (!actionMatch) fail(`step ${id} has no \`\`\`action ...\`\`\` block to execute`);
  let action;
  try {
    action = JSON.parse(actionMatch[1]);
  } catch (e) {
    fail(`step ${id} action block is not valid JSON: ${e.message}`);
  }
  return { section, risk, action };
}

function dryRun(action) {
  switch (action.type) {
    case "delete_lines":
      return previewDeleteLines(action);
    case "replace_frontmatter_field":
      return previewReplaceFrontmatterField(action);
    case "extract_section":
      return previewExtractSection(action);
    default:
      fail(`unknown action type: ${action.type}`);
  }
}

function writeAction(action) {
  switch (action.type) {
    case "delete_lines":
      return doDeleteLines(action);
    case "replace_frontmatter_field":
      return doReplaceFrontmatterField(action);
    case "extract_section":
      return doExtractSection(action);
    default:
      fail(`unknown action type: ${action.type}`);
  }
}

function readTarget(file) {
  const abs = join(values.root, file);
  if (!existsSync(abs)) fail(`file not found: ${abs}`);
  return { abs, raw: readFileSync(abs, "utf8") };
}

function previewDeleteLines({ file, from, to }) {
  const { raw } = readTarget(file);
  const lines = raw.split("\n");
  const removed = lines.slice(from - 1, to).join("\n");
  return { file, removed_line_count: to - from + 1, preview: removed.slice(0, 400) };
}

function doDeleteLines({ file, from, to }) {
  const { abs, raw } = readTarget(file);
  const lines = raw.split("\n");
  const after = [...lines.slice(0, from - 1), ...lines.slice(to)].join("\n");
  writeFileSync(abs, after, "utf8");
  return { file, removed_line_count: to - from + 1 };
}

function previewReplaceFrontmatterField({ file, field, value }) {
  const { raw } = readTarget(file);
  const { frontmatter } = parseFrontmatter(raw);
  return { file, field, old: frontmatter[field] ?? null, new: value };
}

function doReplaceFrontmatterField({ file, field, value }) {
  const { abs, raw } = readTarget(file);
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) fail(`no frontmatter in ${file}`);
  const yamlLines = m[1].split(/\r?\n/);
  const body = m[2];

  const fieldRe = new RegExp(`^${escapeRe(field)}\\s*:`);
  let startIdx = yamlLines.findIndex((l) => fieldRe.test(l));
  if (startIdx === -1) {
    yamlLines.push(formatYamlField(field, value));
  } else {
    let endIdx = startIdx + 1;
    while (endIdx < yamlLines.length && /^\s+/.test(yamlLines[endIdx])) endIdx++;
    yamlLines.splice(startIdx, endIdx - startIdx, formatYamlField(field, value));
  }

  const newContent = `---\n${yamlLines.join("\n")}\n---\n${body}`;
  writeFileSync(abs, newContent, "utf8");
  return { file, field, applied: value };
}

function formatYamlField(field, value) {
  if (Array.isArray(value)) {
    return `${field}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
  }
  if (typeof value === "string") return `${field}: ${value}`;
  return `${field}: ${JSON.stringify(value)}`;
}

function previewExtractSection({ from, to, section_heading }) {
  const src = readTarget(from);
  const section = extractSection(src.raw, section_heading);
  if (!section) fail(`section not found: ${section_heading}`);
  return {
    from,
    to,
    section_heading,
    extracted_bytes: section.length,
    target_exists: existsSync(join(values.root, to)),
  };
}

function doExtractSection({ from, to, section_heading }) {
  const src = readTarget(from);
  const section = extractSection(src.raw, section_heading);
  if (!section) fail(`section not found: ${section_heading}`);
  const targetAbs = join(values.root, to);
  mkdirSync(dirname(targetAbs), { recursive: true });
  let existing = "";
  if (existsSync(targetAbs)) existing = readFileSync(targetAbs, "utf8") + "\n\n";
  writeFileSync(targetAbs, existing + section, "utf8");
  const newSrc = src.raw.replace(
    section,
    `> See [${to}](${to.replace(/^\.github\//, "/.github/")}) for: ${section_heading.replace(/^#+\s*/, "")}\n`,
  );
  writeFileSync(src.abs, newSrc, "utf8");
  return { from, to, section_heading };
}

function extractSection(raw, heading) {
  const lines = raw.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading.trim());
  if (start === -1) return null;
  const level = (heading.match(/^#+/) || [""])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function flipCheckbox(raw, id) {
  const re = new RegExp(`(### ${escapeRe(id)}[\\s\\S]*?- \\[) \\] (\\*\\*Status:\\*\\*[^\\n]*)`);
  const ts = new Date().toISOString();
  return raw.replace(re, `$1x] $2 (applied at ${ts})`);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(msg) {
  process.stderr.write(`apply-step: ${msg}\n`);
  process.exit(2);
}
