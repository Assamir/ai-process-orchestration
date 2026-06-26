import { cancel, confirm, isCancel, multiselect, note, select, text } from "@clack/prompts";
import { chooseTestRepo } from "../detect/repo-map.js";
import { defaultQaConventions, frameworkChoices, frameworkLabel } from "../labels.js";
import type {
  AutomationFramework,
  AutonomyLevel,
  DetectedStack,
  ReportLanguage,
  WizardAnswers,
  WorkspaceInfo,
} from "../types.js";

/**
 * (R-083) Pick the test repo + developer repos non-interactively (used by
 * `--yes` / CI). The most test-like candidate becomes the test repo (deterministic
 * — {@link chooseTestRepo}); every other candidate is a read-only developer repo.
 * `candidates` must hold ≥2 names.
 */
export function defaultWorkspace(candidates: string[]): WorkspaceInfo {
  const testRepo = chooseTestRepo(candidates);
  return { testRepo, devRepos: candidates.filter((c) => c !== testRepo).sort() };
}

/**
 * (R-083) Interactive workspace pick when the parent holds ≥2 repos: choose the
 * **test repo** (where all artifacts land) and confirm the **developer repos**
 * (read-only source). Returns null on cancel so the caller exits cleanly.
 */
export async function runWorkspaceWizard(candidates: string[]): Promise<WorkspaceInfo | null> {
  note(
    [
      "This folder holds several repositories. One is the test repo — where all QA",
      "orchestration artifacts (context/, skills, MCP config, manifest) will be written.",
      "The others are read-only developer repos: their source is read, never modified.",
      "",
      `Repos found: ${candidates.join(", ")}`,
    ].join("\n"),
    "Multi-repo workspace",
  );

  const testRepo = (await select({
    message: "Which repo is the test repo (the only writable area)?",
    initialValue: chooseTestRepo(candidates),
    options: candidates.map((c) => ({ value: c, label: c })),
  })) as string | symbol;
  if (isCancel(testRepo)) return abort();

  const rest = candidates.filter((c) => c !== testRepo);
  if (rest.length === 0) {
    return { testRepo, devRepos: [] };
  }

  const devRepos = (await multiselect({
    message: "Which repos are read-only developer (source) repos?",
    initialValues: rest,
    options: rest.map((c) => ({ value: c, label: c })),
    required: false,
  })) as string[] | symbol;
  if (isCancel(devRepos)) return abort();

  return { testRepo, devRepos: [...devRepos].sort() };
}

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
    xrayMcp: false,
    markitdownMcp: false,
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

  const xrayMcp = await confirm({
    message: "Wire an Xray MCP server (Jira Test / Test Execution / Test Plan / Test Set) for qa-ticket-review?",
    initialValue: seed.xrayMcp ?? false,
  });
  if (isCancel(xrayMcp)) return abort();

  const markitdownMcp = await confirm({
    message: "Wire the markitdown MCP server (convert local binary attachments to Markdown)?",
    initialValue: seed.markitdownMcp ?? false,
  });
  if (isCancel(markitdownMcp)) return abort();

  return {
    automationFramework,
    reportLanguage,
    autonomyLevel,
    qaConventions: qaConventions.trim(),
    atlassianMcp,
    playwrightMcp,
    xrayMcp,
    markitdownMcp,
  };
}

function abort(): null {
  cancel("Cancelled. Nothing was written.");
  return null;
}
