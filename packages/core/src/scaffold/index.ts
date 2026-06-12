import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { frameworkLabel } from "../labels.js";
import { FOUNDATION, GUIDELINES, rootConfigMarkdown } from "../model/context.js";
import { SKILLS } from "../model/skills.js";
import { render } from "../render.js";
import type { DetectedStack, ScaffoldManifest, WizardAnswers, WriteFile, WriteResult } from "../types.js";

export interface ScaffoldInput {
  root: string;
  adapter: PlatformAdapter;
  stack: DetectedStack;
  answers: WizardAnswers;
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
  const vars = buildVars(stack, answers, generatedAt);

  const files = scaffoldFiles(adapter, stack, answers);

  const results: WriteResult[] = [];
  const fileHashes: Record<string, string> = {};
  for (const f of files) {
    const content = render(f.content, vars);
    results.push(writeFileIfAbsent(join(root, f.rel), content));
    // Record the canonical content hash regardless of created/skipped, so
    // `update` (R-034) has a pristine baseline to compare against later.
    fileHashes[f.rel] = hashContent(content);
  }

  const manifest: ScaffoldManifest = {
    schemaVersion: 1,
    generatedAt,
    platform: adapter.id,
    stack,
    choices: answers,
    skills: SKILLS.map((s) => s.name),
    files: fileHashes,
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
    }),
  ];
}

/** sha256 hex of UTF-8 content — the pristine-baseline fingerprint for `update`. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildVars(
  stack: DetectedStack,
  answers: WizardAnswers,
  generatedAt: string,
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
