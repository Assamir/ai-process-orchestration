import { cancel, confirm, isCancel, note, select, text } from "@clack/prompts";
import { defaultQaConventions, frameworkChoices, frameworkLabel } from "../labels.js";
import type {
  AutomationFramework,
  AutonomyLevel,
  DetectedStack,
  ReportLanguage,
  WizardAnswers,
} from "../types.js";

/**
 * Build answers straight from static analysis, no prompting. Used by `--yes`
 * (non-interactive / CI) and as the seed values for the interactive wizard.
 */
export function defaultAnswers(stack: DetectedStack): WizardAnswers {
  const choices = frameworkChoices(stack);
  const automationFramework =
    stack.primaryFramework !== "unknown" && choices.includes(stack.primaryFramework)
      ? stack.primaryFramework
      : choices[0]!;
  return {
    automationFramework,
    reportLanguage: "en",
    autonomyLevel: "medium",
    qaConventions: defaultQaConventions(automationFramework, stack.linters),
    atlassianMcp: false,
    playwrightMcp: false,
  };
}

/**
 * Drive the phase-1 wizard: confirm/refine what static analysis found. Returns
 * null if the user cancels (Ctrl+C), so the caller can exit cleanly.
 */
export async function runWizard(stack: DetectedStack): Promise<WizardAnswers | null> {
  note(
    [
      `Language:         ${stack.language ?? "not detected"}`,
      `Build tool:       ${stack.buildTool}`,
      `Frameworks:       ${stack.frameworks.length > 0 ? stack.frameworks.map(frameworkLabel).join(", ") : "none detected"}`,
      `Linters:          ${stack.linters.length > 0 ? stack.linters.join(", ") : "none detected"}`,
      `Performance:      ${stack.performance.length > 0 ? stack.performance.join(", ") : "none detected"}`,
      `Manifests:        ${stack.manifests.length > 0 ? stack.manifests.join(", ") : "none"}`,
    ].join("\n"),
    "Detected test stack",
  );

  const seed = defaultAnswers(stack);
  const choices = frameworkChoices(stack);

  const automationFramework = (await select({
    message: "Test-automation framework to standardize on",
    initialValue: seed.automationFramework,
    options: choices.map((fw) => ({ value: fw, label: frameworkLabel(fw) })),
  })) as AutomationFramework | symbol;
  if (isCancel(automationFramework)) return abort();

  const reportLanguage = (await select({
    message: "Language for QA reports and skill output",
    initialValue: seed.reportLanguage,
    options: [
      { value: "en", label: "English" },
      { value: "pl", label: "Polski" },
    ],
  })) as ReportLanguage | symbol;
  if (isCancel(reportLanguage)) return abort();

  const autonomyLevel = (await select({
    message: "How autonomously should the QA agents act?",
    initialValue: seed.autonomyLevel,
    options: [
      { value: "low", label: "Low — propose, wait for approval at each step" },
      { value: "medium", label: "Medium — act within a work-item, ask before risky changes" },
      { value: "high", label: "High — run the full loop, escalate only on judgment calls" },
    ],
  })) as AutonomyLevel | symbol;
  if (isCancel(autonomyLevel)) return abort();

  const qaConventions = await text({
    message: "QA conventions (adjust the detected defaults)",
    initialValue: seed.qaConventions,
  });
  if (isCancel(qaConventions)) return abort();

  const atlassianMcp = await confirm({
    message: "Wire a local Jira + Confluence (Atlassian) MCP server for qa-ticket-review?",
    initialValue: seed.atlassianMcp,
  });
  if (isCancel(atlassianMcp)) return abort();

  const playwrightMcp = await confirm({
    message: "Wire the Playwright browser MCP server (@playwright/mcp) for qa-test-case-design / qa-rca?",
    initialValue: seed.playwrightMcp,
  });
  if (isCancel(playwrightMcp)) return abort();

  return {
    automationFramework,
    reportLanguage,
    autonomyLevel,
    qaConventions: qaConventions.trim(),
    atlassianMcp,
    playwrightMcp,
  };
}

function abort(): null {
  cancel("Cancelled. Nothing was written.");
  return null;
}
