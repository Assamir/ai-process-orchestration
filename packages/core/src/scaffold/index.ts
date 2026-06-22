import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { repoMapMarkdown } from "../detect/repo-map.js";
import { frameworkLabel } from "../labels.js";
import { FOUNDATION, GUIDELINES, rootConfigMarkdown } from "../model/context.js";
import { SKILLS } from "../model/skills.js";
import { render } from "../render.js";
import type {
  DetectedStack,
  FileBaseline,
  ScaffoldManifest,
  WizardAnswers,
  WriteFile,
  WriteResult,
} from "../types.js";

export interface ScaffoldInput {
  root: string;
  adapter: PlatformAdapter;
  stack: DetectedStack;
  answers: WizardAnswers;
  /**
   * (R-038) The running package version, recorded as `manifest.toolVersion` so
   * `update` can later report `scaffolded X → running Y`. Optional: when omitted
   * (e.g. a direct test call) the field is left off, matching pre-R-038 manifests.
   */
  toolVersion?: string;
}

/**
 * Names of the placeholders phase 1 resolves. Anything else (`{{...}}`) is a
 * phase-2 marker. Kept in sync with `buildVars` below — `doctor` reads this to
 * tell "render incomplete" (phase-1 leftover) from "phase 2 not done yet".
 */
export const PHASE1_VAR_NAMES = [
  "GENERATED_AT",
  "PROJECT_LANGUAGE",
  "BUILD_TOOL",
  "AUTOMATION_FRAMEWORK",
  "REPORT_LANGUAGE_NAME",
  "AUTONOMY_LEVEL",
  "LINTERS",
  "QA_CONVENTIONS",
  "REPO_MAP_INVENTORY",
] as const;

/**
 * Write the full QA orchestration for one platform: lean root config, guidelines,
 * the `context/` system of record, the skill suite (via the adapter), the
 * orchestrator, an MCP stub, and the phase-2 handoff manifest.
 *
 * Idempotent: existing files are skipped, never overwritten. Delete `context/`
 * and the platform files to regenerate.
 */
export function scaffold(input: ScaffoldInput): WriteResult[] {
  const { root, adapter, stack, answers } = input;
  const generatedAt = new Date().toISOString();
  // Inventory the repo *before* writing the scaffold, so the phase-1 repo map
  // reflects the application's own layout, not our own generated files.
  const vars = buildVars(stack, answers, generatedAt, repoMapMarkdown(root));

  const files = scaffoldFiles(adapter, stack, answers);

  const results: WriteResult[] = [];
  const fileBaselines: Record<string, FileBaseline> = {};
  for (const f of files) {
    const content = render(f.content, vars);
    results.push(writeFileIfAbsent(join(root, f.rel), content));
    // Record the canonical baseline (hash + content) regardless of
    // created/skipped, so `update` (R-034) has a pristine fingerprint to compare
    // against and (R-039) the rendered base content to merge from later.
    fileBaselines[f.rel] = fileBaseline(content);
  }

  const manifest: ScaffoldManifest = {
    schemaVersion: 1,
    generatedAt,
    ...(input.toolVersion ? { toolVersion: input.toolVersion } : {}),
    platform: adapter.id,
    stack,
    choices: answers,
    skills: SKILLS.map((s) => s.name),
    files: fileBaselines,
  };
  results.push(
    writeFileIfAbsent(join(root, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`),
  );

  return results;
}

/** Canonical scaffold path of the phase-2 handoff manifest, repo-root-relative. */
export const MANIFEST_REL = "context/.scaffold/manifest.json";

/**
 * The full set of template files phase 1 writes for one platform, *unrendered*
 * (placeholders intact). Single source of truth shared by `scaffold` (writes
 * them) and `update` (diffs them against an initialized repo). Excludes the
 * generated manifest, which is not a template.
 */
export function scaffoldFiles(
  adapter: PlatformAdapter,
  stack: DetectedStack,
  answers: WizardAnswers,
): WriteFile[] {
  return [
    { rel: adapter.rootConfigRel, content: rootConfigMarkdown(SKILLS, adapter.invokeNoun) },
    ...GUIDELINES.map((g) => ({ rel: adapter.guidelineRel(g.name), content: g.body })),
    ...FOUNDATION.map((f) => ({ rel: f.rel, content: f.body })),
    ...SKILLS.flatMap((s) => adapter.renderSkill(s)),
    ...adapter.orchestratorFiles(SKILLS),
    adapter.mcpFile({
      framework: answers.automationFramework,
      buildTool: stack.buildTool,
      atlassianMcp: answers.atlassianMcp,
      playwrightMcp: answers.playwrightMcp,
      observability: stack.observability,
      performance: stack.performance,
    }),
  ];
}

/** sha256 hex of UTF-8 content — the pristine-baseline fingerprint for `update`. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * (R-039) Build the recorded baseline for a piece of canonical rendered content:
 * its sha256 fingerprint plus the content itself. Shared by `scaffold` (records
 * the original base) and `update` (re-records it on `create`/`update`) so both
 * write the identical self-contained shape.
 */
export function fileBaseline(content: string): FileBaseline {
  return { hash: hashContent(content), content };
}

export function buildVars(
  stack: DetectedStack,
  answers: WizardAnswers,
  generatedAt: string,
  /**
   * Pre-rendered phase-1 repo-map inventory (R-037). Computed fresh from the
   * target repo by `scaffold`/`update` (both have the root) and passed in here so
   * `buildVars` itself stays a pure transform. Defaults to "" for callers that
   * don't render the repo map.
   */
  repoMapInventory = "",
): Record<string, string> {
  return {
    GENERATED_AT: generatedAt,
    PROJECT_LANGUAGE: stack.language ?? "unknown",
    BUILD_TOOL: stack.buildTool,
    AUTOMATION_FRAMEWORK: frameworkLabel(answers.automationFramework),
    REPORT_LANGUAGE_NAME: answers.reportLanguage === "pl" ? "Polski" : "English",
    AUTONOMY_LEVEL: answers.autonomyLevel,
    LINTERS: stack.linters.length > 0 ? stack.linters.join(", ") : "none detected",
    QA_CONVENTIONS: answers.qaConventions,
    REPO_MAP_INVENTORY: repoMapInventory,
  };
}

function writeFileIfAbsent(absPath: string, content: string): WriteResult {
  if (existsSync(absPath)) {
    return { path: absPath, status: "skipped" };
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return { path: absPath, status: "created" };
}
