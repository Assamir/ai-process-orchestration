import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { testFrameworkLabel } from "../labels.js";
import { templatesDir } from "../templates-path.js";
import type { DetectedStack, ScaffoldManifest, WizardAnswers, WriteResult } from "../types.js";
import { render } from "./render.js";

/** Files the static phase lays down, mapped to their source template. */
const FILE_PLAN: Array<{ template: string; dest: string }> = [
  { template: "AGENTS.md", dest: ".ai/AGENTS.md" },
  { template: "coding-standards.md", dest: ".ai/guidelines/coding-standards.md" },
  { template: "naming-conventions.md", dest: ".ai/guidelines/naming-conventions.md" },
  { template: "example-agent.md", dest: ".ai/agents/example-agent.md" },
];

export interface ScaffoldInput {
  root: string;
  stack: DetectedStack;
  answers: WizardAnswers;
  skillName: string;
}

/**
 * Write the /.ai structure from templates, plus the handoff manifest. Idempotent:
 * existing files are skipped, never overwritten (matches the auditskill INSTALL
 * convention). Delete /.ai to regenerate.
 */
export function scaffold(input: ScaffoldInput): WriteResult[] {
  const { root, stack, answers, skillName } = input;
  const vars = buildVars(stack, answers, skillName);
  const tplDir = templatesDir();
  const results: WriteResult[] = [];

  for (const { template, dest } of FILE_PLAN) {
    const raw = readFileSync(join(tplDir, template), "utf8");
    results.push(writeFileIfAbsent(join(root, dest), render(raw, vars)));
  }

  const manifest: ScaffoldManifest = {
    schemaVersion: 1,
    generatedAt: vars.GENERATED_AT!,
    stack,
    choices: answers,
    skillName,
  };
  results.push(
    writeFileIfAbsent(join(root, ".ai/.scaffold/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  );

  return results;
}

function buildVars(stack: DetectedStack, answers: WizardAnswers, skillName: string): Record<string, string> {
  return {
    GENERATED_AT: new Date().toISOString(),
    PROJECT_LANGUAGE: stack.language ?? "unknown",
    BUILD_TOOL: stack.buildTool,
    TEST_FRAMEWORK: testFrameworkLabel(answers.testFramework),
    LINTERS: stack.linters.length > 0 ? stack.linters.join(", ") : "none detected",
    CODING_STANDARDS: answers.codingStandards,
    NAMING_CONVENTIONS: answers.namingConventions,
    SKILL_NAME: skillName,
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
