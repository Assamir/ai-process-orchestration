import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { testFrameworkLabel } from "../labels.js";
import { render } from "../scaffold/render.js";
import { templatesDir } from "../templates-path.js";
import type { DetectedStack, WizardAnswers, WriteResult } from "../types.js";

export interface InstallSkillInput {
  root: string;
  skillName: string;
  stack: DetectedStack;
  answers: WizardAnswers;
}

/**
 * Install the phase-2 skill into the target repo's .claude/skills/<name>/SKILL.md.
 * Idempotent: an existing skill file is left untouched.
 */
export function installSkill(input: InstallSkillInput): WriteResult {
  const { root, skillName, stack, answers } = input;
  const raw = readFileSync(join(templatesDir(), "skill", "SKILL.md"), "utf8");
  const content = render(raw, {
    SKILL_NAME: skillName,
    PROJECT_LANGUAGE: stack.language ?? "unknown",
    TEST_FRAMEWORK: testFrameworkLabel(answers.testFramework),
  });

  const dest = join(root, ".claude", "skills", skillName, "SKILL.md");
  if (existsSync(dest)) {
    return { path: dest, status: "skipped" };
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, "utf8");
  return { path: dest, status: "created" };
}
