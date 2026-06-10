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
  const vars = buildVars(stack, answers);

  const files: WriteFile[] = [
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

  const results: WriteResult[] = files.map((f) =>
    writeFileIfAbsent(join(root, f.rel), render(f.content, vars)),
  );

  const manifest: ScaffoldManifest = {
    schemaVersion: 1,
    generatedAt: vars.GENERATED_AT!,
    platform: adapter.id,
    stack,
    choices: answers,
    skills: SKILLS.map((s) => s.name),
  };
  results.push(
    writeFileIfAbsent(
      join(root, "context/.scaffold/manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
  );

  return results;
}

function buildVars(stack: DetectedStack, answers: WizardAnswers): Record<string, string> {
  return {
    GENERATED_AT: new Date().toISOString(),
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
