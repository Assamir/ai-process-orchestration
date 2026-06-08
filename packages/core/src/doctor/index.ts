import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
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
  if (existsSync(rootAbs) && !/iron qa rule/i.test(readFileSync(rootAbs, "utf8"))) {
    findings.push({
      id: "IRONQA:missing",
      severity: "error",
      message: `The iron QA rule is missing from ${adapter.rootConfigRel}.`,
      remediation: "Restore it — it must not be removed or weakened.",
    });
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
  files.add(adapter.mcpFile().rel);
  files.add(MANIFEST_REL);
  return [...files];
}

/** Extract relative markdown link targets (skips http/mailto/anchors). */
function relativeLinks(md: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    let target = m[1]!.trim();
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    target = (target.split("#")[0] ?? "").trim();
    if (target !== "") out.push(target);
  }
  return out;
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}
