import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { cancel, confirm, isCancel, multiselect, note, select, text } from "@clack/prompts";
import { chooseTestRepo, chooseTestSubtree, enumerateTestSubtrees } from "../detect/repo-map.js";
import { defaultQaConventions, frameworkChoices, frameworkLabel } from "../labels.js";
import { GUIDELINES } from "../model/context.js";
import { resolveGuidelineNames } from "../scaffold/index.js";
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
 * (R-095/R-096) Normalize a POSIX-relative test subtree path and validate it: it
 * must be non-empty, relative (not absolute), not `"."`, must not escape the host
 * with a leading `..`, and must exist on disk under `hostRoot`. Returns the
 * cleaned path, or an `error` string describing the first failure. Shared by the
 * flag path ({@link resolveEmbeddedWorkspace}) and `doctor` so validation is one
 * definition.
 */
export function validateTestSubpath(
  hostRoot: string,
  testSubpath: string,
): { path: string } | { error: string } {
  const clean = testSubpath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (clean === "") return { error: "--test-subpath must not be empty." };
  if (isAbsolute(testSubpath) || /^[A-Za-z]:/.test(testSubpath))
    return { error: `--test-subpath must be relative to the host repo, not absolute ("${testSubpath}").` };
  if (clean === ".") return { error: '--test-subpath must name a subtree, not the repo root (".").' };
  if (clean === ".." || clean.startsWith("../"))
    return { error: `--test-subpath must stay inside the host repo ("${testSubpath}" escapes it).` };
  if (!existsSync(join(hostRoot, clean)))
    return { error: `--test-subpath "${clean}" does not exist inside the host repo.` };
  return { path: clean };
}

/**
 * (R-096) Build the embedded {@link WorkspaceInfo} from explicit flags — the
 * override path used by both `--yes`/CI and an interactive run that passed
 * `--test-subpath`. Pure (no prompts), so it is directly testable. `testHost`
 * names the host developer repo in a **multi-host** layout (must be one of
 * `candidates`); omitted ⇒ **single-host** (`testRepo: "."`, no dev repos). The
 * subtree is validated relative to the resolved host root. Returns the workspace,
 * or an `error` string.
 */
export function resolveEmbeddedWorkspace(opts: {
  root: string;
  testSubpath: string;
  testHost?: string;
  /** Sibling repos found under `root` (`enumerateRepos`) — used for multi-host derivation + validation. */
  candidates: string[];
}): { workspace: WorkspaceInfo } | { error: string } {
  const { root, testSubpath, testHost, candidates } = opts;
  const host = testHost ?? ".";
  if (host !== ".") {
    if (!candidates.includes(host))
      return {
        error: `--test-host "${host}" is not a repo under the parent (found: ${candidates.join(", ") || "none"}).`,
      };
  }
  const hostRoot = host === "." ? root : join(root, host);
  const sub = validateTestSubpath(hostRoot, testSubpath);
  if ("error" in sub) return sub;
  const devRepos = host === "." ? [] : candidates.filter((c) => c !== host).sort();
  return { workspace: { testRepo: host, devRepos, testSubpath: sub.path } };
}

/**
 * (R-096) Interactive embedded proposal. Discovers candidate test subtrees inside
 * the host(s) and, if any are found, proposes the most likely one and lets the
 * user **confirm / correct / decline**. Returns the chosen embedded
 * {@link WorkspaceInfo}, or `null` when nothing is found, the user declines, or
 * cancels — in which case the caller falls back to ordinary single/multi-repo
 * behavior (the embedded topology is never entered silently).
 *
 * - **Single repo** (`candidates` empty): searches `root`; a pick is single-host
 *   (`testRepo: "."`).
 * - **Parent** (`candidates` ≥ 2, offered only when no *dedicated* test repo was
 *   found): searches each candidate repo; a pick is multi-host (that repo hosts
 *   the subtree, the rest are read-only dev repos).
 */
export async function runEmbeddedWizard(opts: {
  root: string;
  candidates: string[];
}): Promise<WorkspaceInfo | null> {
  const { root, candidates } = opts;
  // (host, subtree) pairs across the searchable hosts.
  const hosts = candidates.length >= 2 ? candidates : ["."];
  const pairs: Array<{ host: string; subtree: string }> = [];
  for (const host of hosts) {
    const hostRoot = host === "." ? root : join(root, host);
    for (const subtree of enumerateTestSubtrees(hostRoot)) pairs.push({ host, subtree });
  }
  if (pairs.length === 0) return null;

  // Best pick: prefer the strongest subtree (chooseTestSubtree over each host's
  // subtrees), then the first host in sorted order for stability.
  const best = pickBestPair(pairs);
  const label = best.host === "." ? `${best.subtree}/` : `${best.host}/${best.subtree}`;

  note(
    [
      "This repo has no separate test repository — the test framework lives in a",
      `subtree (${label}). In embedded mode that subtree plus the orchestration`,
      "config are the only writable area; the rest of the host source (and any sibling",
      "repos) is read-only.",
    ].join("\n"),
    "Embedded test topology detected",
  );

  const use = await confirm({
    message: `Use embedded mode with test subtree "${label}"?`,
    initialValue: true,
  });
  if (isCancel(use)) return abort();
  if (!use) return null; // declined → caller falls back to single/multi-repo

  let chosen = best;
  if (pairs.length > 1) {
    // Values are the pair's index (stable, delimiter-free) so a host or subtree name
    // can never collide with a separator.
    const picked = (await select({
      message: "Which subtree is the writable test area?",
      initialValue: String(pairs.indexOf(best)),
      options: pairs.map((p, i) => ({
        value: String(i),
        label: p.host === "." ? `${p.subtree}/` : `${p.host}/${p.subtree}`,
      })),
    })) as string | symbol;
    if (isCancel(picked)) return abort();
    chosen = pairs[Number(picked)] ?? best;
  }

  const devRepos = chosen.host === "." ? [] : candidates.filter((c) => c !== chosen.host).sort();
  return { testRepo: chosen.host, devRepos, testSubpath: chosen.subtree };
}

/** Deterministic best (host, subtree) pair: strongest subtree wins, host breaks ties. */
function pickBestPair(pairs: Array<{ host: string; subtree: string }>): { host: string; subtree: string } {
  const bestSubtree = chooseTestSubtree(pairs.map((p) => p.subtree))!;
  const withBest = pairs.filter((p) => p.subtree === bestSubtree).sort((a, b) => a.host.localeCompare(b.host));
  return withBest[0] ?? pairs[0]!;
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
 *
 * (R-092) After gathering the stack/MCP choices, the wizard pre-selects the
 * **stack-relevant** guideline set (each guideline's `when`, R-091) and lets the
 * user add or remove guidelines; the final set is recorded in
 * `WizardAnswers.guidelines`. `--yes`/CI skips this and leaves `guidelines`
 * undefined, so `scaffold` falls back to the pure `when` result (deterministic).
 */
export async function runWizard(
  stack: DetectedStack,
  workspace?: WorkspaceInfo,
): Promise<WizardAnswers | null> {
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

  const base: WizardAnswers = {
    automationFramework,
    reportLanguage,
    autonomyLevel,
    qaConventions: qaConventions.trim(),
    atlassianMcp,
    playwrightMcp,
    xrayMcp,
    markitdownMcp,
  };

  // (R-092) Guideline-set override. Pre-select the stack-relevant set from each
  // guideline's `when` (R-091, evaluated against the choices just gathered + the
  // workspace), then let the user add/remove. Persisted to `guidelines` so
  // `scaffold`/`update`/`doctor` honor the final set verbatim.
  const preselected = new Set(resolveGuidelineNames(stack, base, workspace));
  const selected = (await multiselect({
    message: "Guidelines to deploy (stack-relevant ones are pre-selected; deselect any you don't want)",
    options: GUIDELINES.map((g) => ({
      value: g.name,
      label: g.title,
      hint: g.when ? "conditional — pre-selected by your stack/choices" : "universal",
    })),
    initialValues: GUIDELINES.filter((g) => preselected.has(g.name)).map((g) => g.name),
    required: false,
  })) as string[] | symbol;
  if (isCancel(selected)) return abort();

  // Record in canonical GUIDELINES order, independent of selection order, so the
  // manifest set is stable.
  const chosen = new Set(selected);
  const guidelines = GUIDELINES.filter((g) => chosen.has(g.name)).map((g) => g.name);

  return { ...base, guidelines };
}

function abort(): null {
  cancel("Cancelled. Nothing was written.");
  return null;
}
