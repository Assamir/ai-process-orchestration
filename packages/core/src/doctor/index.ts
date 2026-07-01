import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import type { WorkspaceInfo } from "../types.js";
import {
  ARTIFACTS,
  DURABLE_DOC_FRONTMATTER,
  docTier,
  frontmatterKeys,
  frontmatterList,
  pathIsPillar,
} from "../model/artifacts.js";
import { GUIDELINES } from "../model/context.js";
import { SKILLS } from "../model/skills.js";
import {
  estimateTokens,
  TOKEN_BUDGETS,
  type TokenBudgets,
  tokenizerName,
} from "../model/tokens.js";
import { expectedFilePaths, MANIFEST_REL, PHASE1_VAR_NAMES } from "../scaffold/index.js";

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
  /** (R-081) The token footprint of the generated surface, always computed. */
  tokens: TokenReport;
}

/** (R-081) Options for {@link runDoctor}. */
export interface DoctorOptions {
  /** Override any of the default token budgets (the rest keep {@link TOKEN_BUDGETS}). */
  tokenBudgets?: Partial<TokenBudgets>;
}

/** (R-081) One measured file in the token footprint. */
export interface TokenFootprintEntry {
  kind: "rootmap" | "guideline" | "skill";
  /** Logical name (guideline/skill name; "root config" for the root map). */
  name: string;
  /** Root-relative path measured. */
  rel: string;
  tokens: number;
  /** The budget this file is checked against. */
  budget: number;
  overBudget: boolean;
}

/** (R-081) The full token footprint of a scaffold: per-file + total, with tokenizer. */
export interface TokenReport {
  /** `tiktoken-cl100k` or `chars-div-4` — which estimator ran. */
  tokenizer: string;
  entries: TokenFootprintEntry[];
  total: number;
  totalBudget: number;
  overBudget: boolean;
}

/**
 * Deterministic validator for a scaffolded QA orchestration — the QA analog of
 * `vscode/auditskill`, run **outside the agent loop**. Checks structure, the
 * handoff manifest, leftover phase-1 placeholders, broken relative links, and the
 * iron QA rule. Read-only: it reports, it never edits. Findings carry remediation.
 */
export function runDoctor(root: string, adapter: PlatformAdapter, opts: DoctorOptions = {}): DoctorReport {
  const findings: DoctorFinding[] = [];

  // Read the manifest once up front: it drives the manifest-aware structure check
  // (the R-091 recorded guideline set) and carries the workspace block (R-085/088).
  const manifestAbs = join(root, MANIFEST_REL);
  let manifest:
    | { schemaVersion?: number; platform?: string; workspace?: WorkspaceInfo; choices?: { guidelines?: string[] } }
    | undefined;
  let manifestParseError = false;
  if (existsSync(manifestAbs)) {
    try {
      manifest = JSON.parse(readFileSync(manifestAbs, "utf8")) as typeof manifest;
    } catch {
      manifestParseError = true;
    }
  }
  const workspace = manifest?.workspace;
  // (R-091) The recorded deployed guideline set; absent on a pre-R-091 manifest, in
  // which case `expectedFilePaths` falls back to all guidelines — matching a
  // pre-R-091 scaffold, which deployed every one.
  const guidelineNames = manifest?.choices?.guidelines;
  const expected = expectedFilePaths(adapter, guidelineNames);

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
  if (manifestParseError) {
    findings.push({
      id: "MANIFEST:parse",
      severity: "error",
      message: `${MANIFEST_REL} is not valid JSON.`,
      remediation: "Regenerate the scaffold.",
    });
  } else if (manifest) {
    if (manifest.schemaVersion !== 1) {
      findings.push({
        id: "MANIFEST:schema",
        severity: "error",
        message: `Unexpected manifest schemaVersion: ${String(manifest.schemaVersion)}`,
        remediation: "Regenerate with the current installer.",
      });
    }
    if (manifest.platform && manifest.platform !== adapter.id) {
      findings.push({
        id: "MANIFEST:platform",
        severity: "error",
        message: `Scaffold was generated for "${manifest.platform}", but you ran the ${adapter.id} doctor.`,
        remediation: `Run the ${manifest.platform} package's doctor instead.`,
      });
    }
  }

  // 2b. (R-091) Guideline-set consistency — a guideline file on disk that the
  // manifest's deployed set doesn't list (e.g. one a stack-aware `when` no longer
  // selects, left behind because `update` never deletes). A warn, not an error:
  // an orphan guideline is stale, not broken.
  validateGuidelineSet(root, adapter, guidelineNames, findings);

  // 3. Content scans over generated markdown.
  let phase2Remaining = 0;
  // Guideline files are scanned for residual phase-2 placeholders separately
  // (step 5, GUIDELINE:unfilled — an actionable per-file warn pointing at
  // qa-guidelines), so exclude them from the generic aggregate below to avoid
  // double-reporting the same markers.
  const guidelineRels = new Set(GUIDELINES.map((g) => adapter.guidelineRel(g.name)));
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
    if (!guidelineRels.has(rel)) {
      phase2Remaining += (text.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) ?? []).length;
    }

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
    // 4c. Read-before-you-write rule (R-033) — a standing procedural rule. Optional
    // (warn, not error): its absence is a process-quality gap, not a correctness defect.
    if (!/read before you write/i.test(rootText)) {
      findings.push({
        id: "READFIRST:missing",
        severity: "warn",
        message: `The "Read before you write" standing rule is missing from ${adapter.rootConfigRel}.`,
        remediation:
          "Restore it — every write skill should read the related guidelines/standards before changing files, so work conforms by construction.",
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

    // 5b. Unfilled phase-2 placeholders in a guideline (R-089) — phase 1 seeds the
    // standard, phase 2 must make it project-true. A warn, not an error: a generic
    // guideline is a process-quality gap, not a correctness defect (parallel to
    // READFIRST:missing). The dedicated, actionable complement to the aggregate
    // PHASE2:remaining (which excludes guideline files; see step 3b).
    const unfilled = (text.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) ?? []).length;
    if (unfilled > 0) {
      findings.push({
        id: `GUIDELINE:unfilled:${g.name}`,
        severity: "warn",
        message: `Guideline ${rel} has ${unfilled} unfilled phase-2 placeholder(s).`,
        remediation:
          "Run the qa-guidelines skill/prompt to fill it with project-specific rules and ✅/❌ examples grounded in the codebase.",
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

  // 7. Grounding guideline (R-029, evidence-collection standard R-045) — must keep
  // its anti-hallucination contract: cite real *evidence* and flag uncertainty
  // rather than invent. The "evidence" term (R-045) keeps the ranked evidence-type
  // table / identifier-scrub standard load-bearing. Content check parallel to the
  // iron-QA-rule and docs-as-code checks, so gutting it fails.
  const groundingRel = adapter.guidelineRel("grounding");
  const groundingAbs = join(root, groundingRel);
  if (existsSync(groundingAbs)) {
    const text = readFileSync(groundingAbs, "utf8").toLowerCase();
    if (!text.includes("cite") || !text.includes("uncertain") || !text.includes("evidence")) {
      findings.push({
        id: "GROUNDING:contract",
        severity: "error",
        message: `The grounding guideline (${groundingRel}) no longer states its core contract (cite ranked evidence; flag uncertainty instead of inventing).`,
        remediation:
          "Restore the contract: cite `file:line` / ticket id / result-MCP output for every claim, prefer the strongest evidence type, never invent paths/APIs/results, and flag uncertainty explicitly. It must not be weakened.",
      });
    }
  }

  // 8. Environment-management guideline (R-035) — must keep its core contract:
  // configuration via environment variables, never a secret committed to the repo.
  // Content check parallel to the docs-as-code and grounding checks.
  const envMgmtRel = adapter.guidelineRel("environment-management");
  const envMgmtAbs = join(root, envMgmtRel);
  if (existsSync(envMgmtAbs)) {
    const text = readFileSync(envMgmtAbs, "utf8").toLowerCase();
    if (!text.includes("secret") || !text.includes("environment variable")) {
      findings.push({
        id: "ENVMGMT:contract",
        severity: "error",
        message: `The environment-management guideline (${envMgmtRel}) no longer states its core contract (configuration via environment variables; never commit secrets).`,
        remediation:
          "Restore the contract: per-environment config (base URLs, accounts, seeds) flows through environment variables; secrets are never committed to the repo. It must not be weakened.",
      });
    }
  }

  // 9. Code-formatting guideline (R-054) — must keep its core safeguard: the
  // generalized `@formatter:off` / `@formatter:on` autoformatter guards that keep
  // content the formatter would mangle (chiefly Mermaid diagrams) byte-stable.
  // Content check parallel to the docs-as-code / grounding / env-management checks.
  const fmtRel = adapter.guidelineRel("code-formatting");
  const fmtAbs = join(root, fmtRel);
  if (existsSync(fmtAbs)) {
    const text = readFileSync(fmtAbs, "utf8").toLowerCase();
    if (!text.includes("@formatter:off") || !text.includes("@formatter:on")) {
      findings.push({
        id: "FORMATTER:guards",
        severity: "error",
        message: `The code-formatting guideline (${fmtRel}) no longer states its core safeguard (the \`@formatter:off\` / \`@formatter:on\` autoformatter guards).`,
        remediation:
          "Restore the guards: formatting is tool-owned and deterministic, and content the formatter would mangle (Mermaid diagrams, aligned tables, ASCII art) is wrapped in `@formatter:off` / `@formatter:on`. It must not be weakened.",
      });
    }
  }

  // 10. Documentation meta-standard (R-069) — the keystone of the documentation
  // pillars. Two halves of the "rule + check" pattern:
  //  (a) the `documentation` guideline must keep its core contract (frontmatter +
  //      "when to use" + length discipline), a content check parallel to the
  //      docs-as-code / grounding / env-management / formatter checks; and
  //  (b) every durable doc (foundation/reference/knowledge) carries the full
  //      frontmatter, so the seeded skeleton is born compliant and R-070/R-061 can
  //      read `owner-skill`/`status`/`built-on` off it.
  const docStdRel = adapter.guidelineRel("documentation");
  const docStdAbs = join(root, docStdRel);
  if (existsSync(docStdAbs)) {
    const text = readFileSync(docStdAbs, "utf8").toLowerCase();
    if (!text.includes("frontmatter") || !text.includes("when to use") || !text.includes("length")) {
      findings.push({
        id: "DOCSTD:contract",
        severity: "error",
        message: `The documentation guideline (${docStdRel}) no longer states its core contract (YAML frontmatter, a "When to use this document" lede, and length discipline).`,
        remediation:
          "Restore the contract: every generated doc carries frontmatter, a single H1, a when-to-use lede, and earns its length (link out, don't restate). It composes grounding/diagram-conventions/documentation-as-code. It must not be weakened.",
      });
    }
  }
  for (const rel of mdFiles) {
    if (docTier(rel) !== "durable") continue;
    const keys = frontmatterKeys(readFileSync(join(root, rel), "utf8"));
    const missing = DURABLE_DOC_FRONTMATTER.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      findings.push({
        id: `DOCSTD:frontmatter:${rel}`,
        severity: "error",
        message: `Durable doc ${rel} is missing required frontmatter key(s): ${missing.join(", ")}.`,
        remediation: `Add a YAML frontmatter block with ${DURABLE_DOC_FRONTMATTER.join(", ")} (the documentation standard). It must sit at the top, between \`---\` fences.`,
      });
    }
  }

  // 11. Pillar provenance (R-070) — every runtime artifact records the
  // documentation pillars it rests on in its `built-on:` frontmatter. A broken
  // provenance link is an error (it points at a pillar doc that isn't there); a
  // required pillar with no resolved entry is a warn (the hard gate at `status:
  // ready` folds into R-061). Safe on a fresh scaffold: `context/changes/` is
  // empty, so nothing is checked.
  validateProvenance(root, findings);

  // 12. Multi-repo workspace boundaries (R-085) — two halves of the "rule + check"
  // pattern: (a) the `multi-repo-boundaries` guideline must keep its core contract
  // (the test repo is the only writable area; developer repos are read-only), a
  // content check parallel to env-management/grounding; and (b) when the manifest
  // carries a `workspace` block, no scaffold output may leak into a developer-repo
  // tree (resolved at `../<repo>` from the test repo). Inert on a single-repo
  // scaffold (no workspace block ⇒ no leak check), so the invariant holds.
  const multiRepoRel = adapter.guidelineRel("multi-repo-boundaries");
  const multiRepoAbs = join(root, multiRepoRel);
  if (existsSync(multiRepoAbs)) {
    const text = readFileSync(multiRepoAbs, "utf8").toLowerCase();
    if (!text.includes("read-only") || !text.includes("test repo") || !text.includes("developer repo")) {
      findings.push({
        id: "MULTIREPO:contract",
        severity: "error",
        message: `The multi-repo-boundaries guideline (${multiRepoRel}) no longer states its core contract (the test repo is the only writable area; developer repos are read-only source).`,
        remediation:
          "Restore the contract: orchestration artifacts are written only into the test repo; developer repos are read-only source, read at `../<repo>/file:line` and never modified. It must not be weakened.",
      });
    }
  }
  validateWorkspaceLeaks(root, adapter, workspace, findings);

  // 13. Embedded test topology (R-095/R-098) — when the manifest records a
  // `testSubpath`, validate the writable-subtree contract: the subtree exists and
  // is a real subtree of the host, the load-bearing boundary rule names it in the
  // root config, and the editor guardrail (single-host `.vscode/settings.json` /
  // multi-host `.code-workspace`) is present. Inert unless `testSubpath` is set, so
  // dedicated multi-repo / single-repo scaffolds are unaffected.
  validateEmbedded(root, adapter, workspace, findings);

  // 14. (R-081) Token-budget footprint — the QA analog of `vscode/auditskill`'s
  // token count. Warn-only: size is a smell, not a defect, so an over-budget file
  // can never fail a clean scaffold or break parity. `TOKENS:rootmap` is the
  // strategic one — the always-resident lean root map must survive compaction
  // (TECH §11); per-guideline / per-skill / total round out the footprint. The
  // measured report is attached to `DoctorReport` unconditionally so the CLI can
  // print the footprint even when nothing is over budget.
  const budgets: TokenBudgets = { ...TOKEN_BUDGETS, ...(opts.tokenBudgets ?? {}) };
  const tokens = computeTokenFootprint(root, adapter, guidelineNames, budgets);
  for (const e of tokens.entries) {
    if (!e.overBudget) continue;
    findings.push({
      id: e.kind === "rootmap" ? "TOKENS:rootmap" : `TOKENS:${e.kind}:${e.name}`,
      severity: "warn",
      message: `${e.rel} is ~${e.tokens} tokens (budget ${e.budget}, ${tokens.tokenizer}).`,
      remediation:
        e.kind === "rootmap"
          ? "Trim the lean root map — it is always resident and must survive compaction. Move detail into a guideline or the context/ system of record and link to it (see TECH §11)."
          : e.kind === "guideline"
            ? "Trim this guideline toward its lean tier — keep the rule + ✅/❌ examples, move the long form into the generated full guide under docs/guidelines/ (link, don't restate)."
            : "Trim this skill's procedure — a skill is a lean, single-purpose map, not a manual. Move reference detail into a guideline or foundation doc and link to it.",
    });
  }
  if (tokens.overBudget) {
    findings.push({
      id: "TOKENS:total",
      severity: "warn",
      message: `The generated surface is ~${tokens.total} tokens (budget ${tokens.totalBudget}, ${tokens.tokenizer}).`,
      remediation:
        "The scaffold is a map, not a thousand-page manual. Trim the largest guidelines/skills toward their lean tiers and push reference detail into linked docs (see TECH §11).",
    });
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  return { platform: adapter.id, findings, errorCount, warnCount, ok: errorCount === 0, tokens };
}

/**
 * (R-081) Measure the token footprint of the generated surface: the lean root map,
 * each deployed guideline, and each rendered skill file. Reads the files actually
 * on disk (so it reflects the *rendered* footprint, phase-1 placeholders resolved),
 * skipping any that are absent (a missing file is already a STRUCT error). The
 * deployed guideline set is manifest-driven (`guidelineNames`); absent that (a
 * pre-R-091 manifest / direct call) every guideline is measured, matching
 * `expectedFilePaths`. Uses the dependency-free {@link estimateTokens} (tiktoken
 * cl100k when globally importable, else chars/4 — see `model/tokens.ts`).
 */
function computeTokenFootprint(
  root: string,
  adapter: PlatformAdapter,
  guidelineNames: string[] | undefined,
  budgets: TokenBudgets,
): TokenReport {
  const entries: TokenFootprintEntry[] = [];
  const read = (rel: string): number | null => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return null;
    return estimateTokens(readFileSync(abs, "utf8"));
  };

  const rc = read(adapter.rootConfigRel);
  if (rc !== null) {
    entries.push({
      kind: "rootmap",
      name: "root config",
      rel: adapter.rootConfigRel,
      tokens: rc,
      budget: budgets.rootMap,
      overBudget: rc > budgets.rootMap,
    });
  }

  const gset = guidelineNames ? new Set(guidelineNames) : null;
  for (const g of GUIDELINES) {
    if (gset && !gset.has(g.name)) continue;
    const rel = adapter.guidelineRel(g.name);
    const t = read(rel);
    if (t !== null) {
      entries.push({ kind: "guideline", name: g.name, rel, tokens: t, budget: budgets.guideline, overBudget: t > budgets.guideline });
    }
  }

  for (const s of SKILLS) {
    for (const w of adapter.renderSkill(s)) {
      const t = read(w.rel);
      if (t !== null) {
        entries.push({ kind: "skill", name: s.name, rel: w.rel, tokens: t, budget: budgets.skill, overBudget: t > budgets.skill });
      }
    }
  }

  const total = entries.reduce((sum, e) => sum + e.tokens, 0);
  return { tokenizer: tokenizerName(), entries, total, totalBudget: budgets.total, overBudget: total > budgets.total };
}

/**
 * (R-070) Walk `context/changes/<work-id>/` for the runtime artifacts that
 * declare `requiredPillars`, and check each filled artifact's `built-on:`
 * provenance: real-but-missing entries error (`BUILTON:link`), and a required
 * pillar with no resolved entry warns (`BUILTON:pillar`). Unresolved placeholder
 * entries (`<topic>`) are ignored for the link check and don't count as covering
 * a pillar — so a not-yet-filled `built-on:` surfaces as the warn, not a false
 * broken-link error.
 */
function validateProvenance(root: string, findings: DoctorFinding[]): void {
  const changesAbs = join(root, "context/changes");
  if (!existsSync(changesAbs)) return;
  const runtime = ARTIFACTS.filter(
    (a) => a.requiredPillars && a.requiredPillars.length > 0 && a.pathTemplate.startsWith("context/changes/<work-id>/"),
  ).map((a) => ({ artifact: a, base: posix.basename(a.pathTemplate) }));
  if (runtime.length === 0) return;

  let dirs: import("node:fs").Dirent[];
  try {
    dirs = readdirSync(changesAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    for (const { artifact, base } of runtime) {
      const rel = `context/changes/${d.name}/${base}`;
      const abs = join(root, rel);
      if (!existsSync(abs)) continue;
      const builtOn = frontmatterList(readFileSync(abs, "utf8"), "built-on");
      const resolved = builtOn.filter((e) => !/[<>]/.test(e));
      for (const e of resolved) {
        if (!existsSync(join(root, e))) {
          findings.push({
            id: `BUILTON:link:${rel}:${e}`,
            severity: "error",
            message: `Broken pillar-provenance link in ${rel}: built-on points at ${e}, which does not exist.`,
            remediation: `Fix the \`built-on:\` path or generate ${e} (e.g. via qa-reverse-engineer / qa-knowledge / qa-framework-analyze).`,
          });
        }
      }
      for (const pillar of artifact.requiredPillars!) {
        const covered = resolved.some((e) => pathIsPillar(e, pillar) && existsSync(join(root, e)));
        if (!covered) {
          findings.push({
            id: `BUILTON:pillar:${rel}:${pillar}`,
            severity: "warn",
            message: `${rel} (${artifact.name}) should rest on pillar ${pillar} but its \`built-on:\` lists no resolved ${pillar} doc.`,
            remediation: `Add the ${pillar} pillar doc this artifact is built on to its \`built-on:\` frontmatter (P1=context/reference/, P2=context/knowledge/ or refinements/, P3=context/foundation/framework-architecture.md).`,
          });
        }
      }
    }
  }
}

/**
 * (R-085) When the manifest carries a `workspace` block, the developer repos must
 * be **read-only**: no scaffold output may leak into their trees. Each dev repo is
 * resolved at `../<repo>` from the test repo (where `doctor` runs, `--root
 * <test-repo>`, R-088), and checked for the telltale scaffold artifacts — the
 * platform root config, the manifest, the `context/` system of record, and the
 * skills/prompts directories. A hit is an error (`MULTIREPO:leak:<repo>`). The
 * R-086 `.code-workspace` lives in the *parent*, not in any dev repo, so it is
 * naturally outside this scan — the sanctioned write needs no special-casing.
 */
function validateWorkspaceLeaks(
  root: string,
  adapter: PlatformAdapter,
  workspace: WorkspaceInfo | undefined,
  findings: DoctorFinding[],
): void {
  if (!workspace || workspace.devRepos.length === 0) return;
  // Telltale paths that mean scaffold output landed in a repo.
  const leakMarkers = [
    adapter.rootConfigRel,
    MANIFEST_REL,
    "context/.scaffold",
    ".claude/skills",
    ".github/prompts",
    ".ai/guidelines",
  ];
  for (const dev of workspace.devRepos) {
    const devRoot = join(root, "..", dev);
    if (!existsSync(devRoot)) continue; // not present locally — nothing to check
    const leaked = leakMarkers.filter((m) => existsSync(join(devRoot, m)));
    if (leaked.length > 0) {
      findings.push({
        id: `MULTIREPO:leak:${dev}`,
        severity: "error",
        message: `Scaffold output leaked into the read-only developer repo "${dev}": ${leaked.join(", ")}.`,
        remediation: `Remove the orchestration artifacts from ../${dev} — developer repos are read-only source. All artifacts belong in the test repo (see the multi-repo-boundaries guideline).`,
      });
    }
  }
}

/**
 * (R-095/R-098) When the manifest records a `testSubpath`, validate the **embedded
 * test topology**: the writable area is that subtree plus the host-root config, and
 * everything else is read-only. Runs at the host root (`root` = the write root).
 * Checks, in order:
 *
 * - `EMBEDDED:subpath` (error) — the subtree is a relative path to an existing
 *   directory inside the host (not `.`, not absolute, does not escape).
 * - `EMBEDDED:leak:subtree` (error) — no orchestration install nested *inside* the
 *   subtree (config belongs at the host root; a nested install means `init` ran in
 *   the wrong place).
 * - `EMBEDDED:rule` (error) — the lean root config still carries the load-bearing
 *   workspace-boundary rule naming the subtree (it must survive compaction).
 * - `EMBEDDED:guardrail` (warn) — the editor guardrail file is present
 *   (single-host `.vscode/settings.json`; multi-host `.code-workspace`). A defense
 *   layer, so a warn, not an error.
 *
 * Multi-host sibling-repo leaks are covered by {@link validateWorkspaceLeaks} (it
 * fires whenever `devRepos` is non-empty). Inert unless `testSubpath` is set.
 */
function validateEmbedded(
  root: string,
  adapter: PlatformAdapter,
  workspace: WorkspaceInfo | undefined,
  findings: DoctorFinding[],
): void {
  const testSubpath = workspace?.testSubpath;
  if (!testSubpath) return;

  const invalidShape =
    testSubpath === "." || testSubpath.startsWith("..") || /^([A-Za-z]:|[/\\])/.test(testSubpath);
  const subAbs = join(root, testSubpath);
  if (invalidShape || !existsSync(subAbs)) {
    findings.push({
      id: "EMBEDDED:subpath",
      severity: "error",
      message: `The embedded test subtree "${testSubpath}" is invalid or missing — it must be a relative path to an existing directory inside the host repo.`,
      remediation: "Point manifest.workspace.testSubpath at an existing subtree of the host repo, or re-run init with --test-subpath <path>.",
    });
    return; // the remaining checks assume a resolvable subtree
  }

  const nestedMarkers = [MANIFEST_REL, adapter.rootConfigRel, ".claude/skills", ".github/prompts"];
  const nested = nestedMarkers.filter((m) => existsSync(join(subAbs, m)));
  if (nested.length > 0) {
    findings.push({
      id: "EMBEDDED:leak:subtree",
      severity: "error",
      message: `Orchestration output found inside the test subtree ${testSubpath}/: ${nested.join(", ")}. Config belongs at the host root, not inside the subtree.`,
      remediation: `Remove the nested orchestration install from ${testSubpath}/ — the subtree holds tests; the context/ + config live at the host root.`,
    });
  }

  const rootAbs = join(root, adapter.rootConfigRel);
  if (existsSync(rootAbs)) {
    const text = readFileSync(rootAbs, "utf8");
    if (!text.includes("Workspace boundary") || !text.includes(`\`${testSubpath}/\``)) {
      findings.push({
        id: "EMBEDDED:rule",
        severity: "error",
        message: `The lean root config (${adapter.rootConfigRel}) no longer carries the embedded write-boundary rule naming the test subtree \`${testSubpath}/\`.`,
        remediation: `Restore the workspace-boundary rule: the only writable area is \`${testSubpath}/\` plus the host-root orchestration config; the rest of the host is read-only source. It must survive compaction.`,
      });
    }
  }

  const singleHost = workspace.testRepo === ".";
  if (singleHost) {
    if (!existsSync(join(root, ".vscode/settings.json"))) {
      findings.push({
        id: "EMBEDDED:guardrail",
        severity: "warn",
        message: "Single-host embedded scaffold is missing its editor guardrail (.vscode/settings.json with files.readonly* keys).",
        remediation: `Add a .vscode/settings.json pinning the host source read-only and carving out ${testSubpath}/ + the orchestration config (re-running init regenerates it when absent).`,
      });
    }
  } else {
    const wsFile = workspace.workspaceFile;
    if (!wsFile || !existsSync(join(root, wsFile))) {
      findings.push({
        id: "EMBEDDED:guardrail",
        severity: "warn",
        message: `Multi-host embedded scaffold is missing its .code-workspace editor guardrail${wsFile ? ` (${wsFile})` : ""}.`,
        remediation: "Re-run init to regenerate the parent .code-workspace with the host's readonlyExclude carve-out.",
      });
    }
  }
}

/**
 * (R-091) Compare the guideline files on disk against the manifest's recorded
 * deployed set (`manifest.choices.guidelines`). A file present on disk but absent
 * from the recorded set warns (`GUIDELINE:unexpected:<name>`) — typically a
 * guideline a stack-aware `when` no longer selects, which `update` reports as an
 * orphan and never deletes. The guideline directory + filename shape are derived
 * from `adapter.guidelineRel` (a `__NAME__` token), so this stays correct for both
 * platforms. No recorded set (pre-R-091 manifest) ⇒ nothing to check.
 */
function validateGuidelineSet(
  root: string,
  adapter: PlatformAdapter,
  guidelineNames: string[] | undefined,
  findings: DoctorFinding[],
): void {
  if (!guidelineNames) return;
  const recorded = new Set(guidelineNames);
  const TOKEN = "__NAME__";
  const sample = toPosix(adapter.guidelineRel(TOKEN));
  const dirRel = posix.dirname(sample);
  const baseSample = posix.basename(sample);
  const ti = baseSample.indexOf(TOKEN);
  if (ti < 0) return;
  const pre = baseSample.slice(0, ti);
  const suf = baseSample.slice(ti + TOKEN.length);

  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(join(root, dirRel), { withFileTypes: true });
  } catch {
    return; // directory absent — the structure check already covers missing files
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const n = e.name;
    if (pre && !n.startsWith(pre)) continue;
    if (!n.endsWith(suf)) continue;
    const name = n.slice(pre.length, n.length - suf.length);
    if (name.length === 0 || recorded.has(name)) continue;
    findings.push({
      id: `GUIDELINE:unexpected:${name}`,
      severity: "warn",
      message: `Guideline ${dirRel}/${n} is on disk but not in the manifest's deployed guideline set.`,
      remediation:
        "It's likely a guideline a stack-aware `when` no longer selects (R-091). `update` reports it as an orphan and never deletes it — remove it by hand if it no longer applies, or add it back to the deployed set.",
    });
  }
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

  const mdFiles = expectedFilePaths(adapter).filter(
    (r) => r.endsWith(".md") && existsSync(join(root, r)),
  );
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
  // A link inside a fenced or inline code span is not a link — blank those regions
  // first so e.g. a `[text](url)` example in a doc table isn't flagged as broken.
  // (Length is preserved so this stays cheap and order-stable.)
  const scannable = md
    .replace(/```[\s\S]*?```/g, (s) => " ".repeat(s.length))
    .replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length));
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scannable)) !== null) {
    const raw = m[1]!.trim();
    if (/^(https?:|mailto:|#)/i.test(raw)) continue;
    const hash = raw.indexOf("#");
    const path = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const anchor = hash === -1 ? "" : raw.slice(hash);
    if (path !== "") out.push({ raw, path, anchor });
  }
  return out;
}
