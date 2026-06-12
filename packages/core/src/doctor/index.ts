import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { FOUNDATION, GUIDELINES } from "../model/context.js";
import { SKILLS } from "../model/skills.js";
import { PHASE1_VAR_NAMES } from "../scaffold/index.js";

export interface DoctorFinding {
  /** Deterministic, stable across runs. */
  id: string;
  severity: "error" | "warn";
  message: string;
  /** Actionable fix, written so an agent can act on it (carries remediation). */
  remediation: string;
}

export interface DoctorReport {
  platform: string;
  findings: DoctorFinding[];
  errorCount: number;
  warnCount: number;
  /** No error-severity findings. */
  ok: boolean;
}

const MANIFEST_REL = "context/.scaffold/manifest.json";

/**
 * Deterministic validator for a scaffolded QA orchestration — the QA analog of
 * `vscode/auditskill`, run **outside the agent loop**. Checks structure, the
 * handoff manifest, leftover phase-1 placeholders, broken relative links, and the
 * iron QA rule. Read-only: it reports, it never edits. Findings carry remediation.
 */
export function runDoctor(root: string, adapter: PlatformAdapter): DoctorReport {
  const findings: DoctorFinding[] = [];
  const expected = expectedFiles(adapter);

  // 1. Structure — every file phase 1 should have written must exist.
  for (const rel of expected) {
    if (!existsSync(join(root, rel))) {
      findings.push({
        id: `STRUCT:${rel}`,
        severity: "error",
        message: `Missing expected file: ${rel}`,
        remediation: `Re-run \`init\` for this platform, or restore ${rel}.`,
      });
    }
  }

  // 2. Manifest — valid JSON, known schema, matching platform.
  const manifestAbs = join(root, MANIFEST_REL);
  if (existsSync(manifestAbs)) {
    try {
      const m = JSON.parse(readFileSync(manifestAbs, "utf8")) as {
        schemaVersion?: number;
        platform?: string;
      };
      if (m.schemaVersion !== 1) {
        findings.push({
          id: "MANIFEST:schema",
          severity: "error",
          message: `Unexpected manifest schemaVersion: ${String(m.schemaVersion)}`,
          remediation: "Regenerate with the current installer.",
        });
      }
      if (m.platform && m.platform !== adapter.id) {
        findings.push({
          id: "MANIFEST:platform",
          severity: "error",
          message: `Scaffold was generated for "${m.platform}", but you ran the ${adapter.id} doctor.`,
          remediation: `Run the ${m.platform} package's doctor instead.`,
        });
      }
    } catch {
      findings.push({
        id: "MANIFEST:parse",
        severity: "error",
        message: `${MANIFEST_REL} is not valid JSON.`,
        remediation: "Regenerate the scaffold.",
      });
    }
  }

  // 3. Content scans over generated markdown.
  let phase2Remaining = 0;
  const mdFiles = expected.filter((r) => r.endsWith(".md") && existsSync(join(root, r)));
  for (const rel of mdFiles) {
    const text = readFileSync(join(root, rel), "utf8");

    // 3a. Leftover phase-1 placeholders mean render was incomplete — an error.
    for (const v of PHASE1_VAR_NAMES) {
      if (text.includes(`{{${v}}}`)) {
        findings.push({
          id: `PHASE1:${rel}:${v}`,
          severity: "error",
          message: `Unrendered phase-1 placeholder {{${v}}} in ${rel}`,
          remediation: "Re-run `init` — phase 1 did not fill this marker.",
        });
      }
    }

    // 3b. Remaining phase-2 placeholders are expected until phase 2 runs — informational.
    phase2Remaining += (text.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) ?? []).length;

    // 3c. Broken relative links.
    for (const target of relativeLinks(text)) {
      const resolved = posix.normalize(posix.join(posix.dirname(toPosix(rel)), target));
      if (!existsSync(join(root, resolved))) {
        findings.push({
          id: `LINK:${rel}:${target}`,
          severity: "error",
          message: `Broken relative link in ${rel} → ${target}`,
          remediation: `Fix the link or create ${resolved}.`,
        });
      }
    }
  }
  if (phase2Remaining > 0) {
    findings.push({
      id: "PHASE2:remaining",
      severity: "warn",
      message: `${phase2Remaining} phase-2 placeholder(s) remain across generated files.`,
      remediation: "Run the qa-init skill/prompt in your tool to complete phase 2.",
    });
  }

  // 4. Iron QA rule must be present in the lean root config.
  const rootAbs = join(root, adapter.rootConfigRel);
  if (existsSync(rootAbs)) {
    const rootText = readFileSync(rootAbs, "utf8");
    if (!/iron qa rule/i.test(rootText)) {
      findings.push({
        id: "IRONQA:missing",
        severity: "error",
        message: `The iron QA rule is missing from ${adapter.rootConfigRel}.`,
        remediation: "Restore it — it must not be removed or weakened.",
      });
    }
    // 4b. Grounding rule (R-029) — equally load-bearing, must survive compaction.
    if (!/grounding rule/i.test(rootText)) {
      findings.push({
        id: "GROUNDING:missing",
        severity: "error",
        message: `The grounding rule is missing from ${adapter.rootConfigRel}.`,
        remediation:
          "Restore it — every claim must cite a real artifact (file:line / ticket id / result-MCP output) and uncertainty must be flagged, not invented. It must not be removed or weakened.",
      });
    }
  }

  // 5. Every guideline must carry good/bad examples (R-026) — show the pattern, don't just describe it.
  for (const g of GUIDELINES) {
    const rel = adapter.guidelineRel(g.name);
    const abs = join(root, rel);
    if (!existsSync(abs)) continue; // a missing file is already reported by the structure check.
    const text = readFileSync(abs, "utf8");
    const missing: string[] = [];
    if (!text.includes("✅")) missing.push("✅ good");
    if (!text.includes("❌")) missing.push("❌ bad");
    if (missing.length > 0) {
      findings.push({
        id: `GUIDELINE:examples:${g.name}`,
        severity: "error",
        message: `Guideline ${rel} is missing a ${missing.join(" and ")} example section.`,
        remediation:
          "Add both a ✅ good and ❌ bad example — every standards/guideline doc must show the pattern, not just describe it.",
      });
    }
  }

  // 6. Documentation-as-code (R-028) — the guideline must keep its load-bearing
  // contract: docs are versioned in-repo and validated by `doctor` in CI. This is
  // a content check (parallel to the iron QA rule), so gutting the guideline fails.
  const docAsCodeRel = adapter.guidelineRel("documentation-as-code");
  const docAsCodeAbs = join(root, docAsCodeRel);
  if (existsSync(docAsCodeAbs)) {
    const text = readFileSync(docAsCodeAbs, "utf8").toLowerCase();
    if (!text.includes("doctor") || !text.includes("ci")) {
      findings.push({
        id: "DOCASCODE:contract",
        severity: "error",
        message: `The documentation-as-code guideline (${docAsCodeRel}) no longer states its core contract (deterministic \`doctor\` validation kept in sync via CI).`,
        remediation:
          "Restore the contract: docs live in-repo, are versioned and reviewed in PR, validated by `doctor`, and kept in sync via CI. It must not be weakened.",
      });
    }
  }

  // 7. Grounding guideline (R-029) — must keep its anti-hallucination contract:
  // cite real sources and flag uncertainty rather than invent. Content check
  // parallel to the iron-QA-rule and docs-as-code checks, so gutting it fails.
  const groundingRel = adapter.guidelineRel("grounding");
  const groundingAbs = join(root, groundingRel);
  if (existsSync(groundingAbs)) {
    const text = readFileSync(groundingAbs, "utf8").toLowerCase();
    if (!text.includes("cite") || !text.includes("uncertain")) {
      findings.push({
        id: "GROUNDING:contract",
        severity: "error",
        message: `The grounding guideline (${groundingRel}) no longer states its core contract (cite real sources; flag uncertainty instead of inventing).`,
        remediation:
          "Restore the contract: cite `file:line` / ticket id / result-MCP output for every claim, never invent paths/APIs/results, and flag uncertainty explicitly. It must not be weakened.",
      });
    }
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  return { platform: adapter.id, findings, errorCount, warnCount, ok: errorCount === 0 };
}

/** Every file phase 1 writes for this platform (mirrors `scaffold`). */
function expectedFiles(adapter: PlatformAdapter): string[] {
  const files = new Set<string>();
  files.add(adapter.rootConfigRel);
  for (const g of GUIDELINES) files.add(adapter.guidelineRel(g.name));
  for (const f of FOUNDATION) files.add(f.rel);
  for (const s of SKILLS) for (const w of adapter.renderSkill(s)) files.add(w.rel);
  for (const w of adapter.orchestratorFiles(SKILLS)) files.add(w.rel);
  // The MCP path is constant regardless of context; a neutral ctx is fine here.
  files.add(adapter.mcpFile({ framework: "unknown", buildTool: "unknown" }).rel);
  files.add(MANIFEST_REL);
  return [...files];
}

/** Extract relative markdown link target paths (skips http/mailto/anchors). */
function relativeLinks(md: string): string[] {
  return scanLinks(md).map((l) => l.path);
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

// --- R-031: deterministic broken-relative-link repair (`doctor --fix`) -------
//
// `runDoctor` only *detects* broken links. `fixLinks` is the optional, still
// deterministic, repair step — the QA analog of auditskill's `apply-step`
// dry-run/write pattern. It repairs the classes it can prove safe and leaves
// everything else as a finding; it never invents a target.

/** The repair class a broken link was matched against. */
export type LinkFixClass = "relocated" | "playwright-report" | "playwright-trace";

export interface LinkFix {
  /** Markdown file (root-relative posix) whose link is repaired. */
  file: string;
  /** Original link target as written, including any `#anchor`. */
  oldTarget: string;
  /** Repaired target — path part rewritten, anchor preserved. */
  newTarget: string;
  /** Root-relative posix path of the file the link now resolves to. */
  resolved: string;
  class: LinkFixClass;
}

export interface DoctorFixReport {
  mode: "dry-run" | "write";
  /** Repairs that can be applied deterministically. */
  fixes: LinkFix[];
  /** Broken links with no unique target — left for a human (still doctor errors). */
  unfixable: { file: string; target: string }[];
}

interface ScannedLink {
  /** Whole target inside the parens, e.g. `./x.md#sec`. */
  raw: string;
  /** Path part (anchor stripped). */
  path: string;
  /** `#anchor` or "". */
  anchor: string;
}

/**
 * Repair broken relative links in the scaffold. Dry-run unless `opts.write`.
 *
 * A link is repairable when its basename resolves to exactly one file in the
 * tree (a relocated file), or — for Playwright report/trace links surfaced by
 * `qa-playwright-cli` / the result MCP — when the Playwright-conventional
 * candidate (`playwright-report/index.html`, `test-results/**\/trace.zip`)
 * uniquely disambiguates several same-named candidates. Anything else is
 * reported as unfixable so `doctor` keeps failing on it.
 */
export function fixLinks(
  root: string,
  adapter: PlatformAdapter,
  opts: { write?: boolean } = {},
): DoctorFixReport {
  const write = opts.write === true;
  const index = basenameIndex(root);

  const fixes: LinkFix[] = [];
  const unfixable: { file: string; target: string }[] = [];
  const editsByFile = new Map<string, Array<{ from: string; to: string }>>();

  const mdFiles = expectedFiles(adapter).filter((r) => r.endsWith(".md") && existsSync(join(root, r)));
  for (const rel of mdFiles) {
    const filePosix = toPosix(rel);
    const text = readFileSync(join(root, rel), "utf8");
    for (const link of scanLinks(text)) {
      const resolved = posix.normalize(posix.join(posix.dirname(filePosix), link.path));
      if (existsSync(join(root, resolved))) continue; // not broken

      const choice = chooseTarget(posix.basename(link.path), index.get(posix.basename(link.path)) ?? []);
      if (choice === null) {
        unfixable.push({ file: rel, target: link.raw });
        continue;
      }
      const newPath = relativePosix(filePosix, choice.resolved);
      const fix: LinkFix = {
        file: rel,
        oldTarget: link.raw,
        newTarget: newPath + link.anchor,
        resolved: choice.resolved,
        class: choice.class,
      };
      fixes.push(fix);
      const edits = editsByFile.get(rel) ?? [];
      edits.push({ from: `](${link.raw})`, to: `](${fix.newTarget})` });
      editsByFile.set(rel, edits);
    }
  }

  if (write) {
    for (const [rel, edits] of editsByFile) {
      const abs = join(root, rel);
      let text = readFileSync(abs, "utf8");
      for (const e of edits) text = text.split(e.from).join(e.to);
      writeFileSync(abs, text, "utf8");
    }
  }

  return { mode: write ? "write" : "dry-run", fixes, unfixable };
}

/** Pick the unique repair target for a broken basename, or null if ambiguous. */
function chooseTarget(
  basename: string,
  candidates: string[],
): { resolved: string; class: LinkFixClass } | null {
  if (candidates.length === 1) {
    return { resolved: candidates[0]!, class: classify(basename, candidates[0]!) };
  }
  // Several same-named files: Playwright conventions can still disambiguate.
  if (basename === "index.html") {
    const pw = candidates.filter((c) => c.split("/").includes("playwright-report"));
    if (pw.length === 1) return { resolved: pw[0]!, class: "playwright-report" };
  }
  if (basename === "trace.zip") {
    const tr = candidates.filter((c) => c.split("/").includes("test-results"));
    if (tr.length === 1) return { resolved: tr[0]!, class: "playwright-trace" };
  }
  return null;
}

function classify(basename: string, resolved: string): LinkFixClass {
  if (basename === "index.html" && resolved.split("/").includes("playwright-report")) {
    return "playwright-report";
  }
  if (basename === "trace.zip") return "playwright-trace";
  return "relocated";
}

/** Map every file's basename → its root-relative posix path(s). */
function basenameIndex(root: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const skip = new Set(["node_modules", ".git"]);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(abs);
      } else if (e.isFile()) {
        const rel = toPosix(relative(root, abs));
        const list = index.get(e.name);
        if (list) list.push(rel);
        else index.set(e.name, [rel]);
      }
    }
  }
  return index;
}

/** Relative posix link from `fromFile` to `toFile` (both root-relative), `./`-prefixed. */
function relativePosix(fromFile: string, toFile: string): string {
  const rel = posix.relative(posix.dirname(fromFile), toFile);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Scan markdown for relative links, capturing the raw target, path part, and anchor. */
function scanLinks(md: string): ScannedLink[] {
  const out: ScannedLink[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const raw = m[1]!.trim();
    if (/^(https?:|mailto:|#)/i.test(raw)) continue;
    const hash = raw.indexOf("#");
    const path = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const anchor = hash === -1 ? "" : raw.slice(hash);
    if (path !== "") out.push({ raw, path, anchor });
  }
  return out;
}
