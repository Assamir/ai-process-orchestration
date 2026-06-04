import { cancel, isCancel, note, select, text } from "@clack/prompts";
import {
  defaultCodingStandards,
  defaultNamingConventions,
  testFrameworkChoices,
  testFrameworkLabel,
} from "../labels.js";
import type { DetectedStack, TestFramework, WizardAnswers } from "../types.js";

/**
 * Build answers straight from static analysis, no prompting. Used by `--yes`
 * (non-interactive / CI) and as the seed values for the interactive wizard.
 */
export function defaultAnswers(stack: DetectedStack): WizardAnswers {
  const choices = testFrameworkChoices(stack.language);
  return {
    testFramework: choices.includes(stack.testFramework) ? stack.testFramework : choices[0]!,
    codingStandards: defaultCodingStandards(stack.language, stack.linters),
    namingConventions: defaultNamingConventions(stack.language),
  };
}

/**
 * Drive the phase-1 wizard: confirm/refine what static analysis found. Returns
 * null if the user cancels (Ctrl+C), so the caller can exit cleanly.
 */
export async function runWizard(stack: DetectedStack): Promise<WizardAnswers | null> {
  note(
    [
      `Language:        ${stack.language ?? "not detected"}`,
      `Build tool:      ${stack.buildTool}`,
      `Test framework:  ${testFrameworkLabel(stack.testFramework)}`,
      `Linters:         ${stack.linters.length > 0 ? stack.linters.join(", ") : "none detected"}`,
      `Manifests:       ${stack.manifests.length > 0 ? stack.manifests.join(", ") : "none"}`,
    ].join("\n"),
    "Detected stack",
  );

  const seed = defaultAnswers(stack);
  const choices = testFrameworkChoices(stack.language);

  const testFramework = (await select({
    message: "Test framework to enforce in the agents' QA rule",
    initialValue: seed.testFramework,
    options: choices.map((fw) => ({ value: fw, label: testFrameworkLabel(fw) })),
  })) as TestFramework | symbol;
  if (isCancel(testFramework)) return abort();

  const codingStandards = await text({
    message: "Coding standards (adjust the detected defaults)",
    initialValue: seed.codingStandards,
  });
  if (isCancel(codingStandards)) return abort();

  const namingConventions = await text({
    message: "Naming conventions (adjust the detected defaults)",
    initialValue: seed.namingConventions,
  });
  if (isCancel(namingConventions)) return abort();

  return {
    testFramework,
    codingStandards: codingStandards.trim(),
    namingConventions: namingConventions.trim(),
  };
}

function abort(): null {
  cancel("Cancelled. Nothing was written.");
  return null;
}
