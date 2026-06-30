import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { renderDeveloperRepos, repoMapMarkdown } from "../detect/repo-map.js";
import { frameworkLabel } from "../labels.js";
import {
  deployedGuidelineBody,
  FOUNDATION,
  type Guideline,
  GUIDELINES,
  rootConfigMarkdown,
} from "../model/context.js";
import { SKILLS } from "../model/skills.js";
import { render } from "../render.js";
import type {
  AutomationFramework,
  DetectedStack,
  FileBaseline,
  ScaffoldManifest,
  WizardAnswers,
  WorkspaceInfo,
  WriteFile,
  WriteResult,
} from "../types.js";

/**
 * (R-091) Is a named MCP server enabled in the wizard choices? Used by the `when`
 * evaluator so `mcp-content-fetch` deploys only when a fetch/ticketing server is on.
 */
function mcpEnabled(name: string, a: WizardAnswers): boolean {
  switch (name) {
    case "atlassian":
      return a.atlassianMcp === true;
    case "xray":
      return a.xrayMcp === true;
    case "markitdown":
      return a.markitdownMcp === true;
    case "playwright":
      return a.playwrightMcp === true;
    default:
      return false;
  }
}

/**
 * (R-091) Does a guideline's `when` match this install context? Absent `when` ⇒
 * **universal** (always true). Mirrors `mcp.ts:resultServers`: an OR across the
 * listed dimensions, each dimension an OR within its own list. `web` has no signal
 * yet, so a `when: { web: true }` guideline never auto-deploys (only the R-092
 * wizard override can add it).
 */
export function guidelineApplies(
  g: Guideline,
  stack: DetectedStack,
  answers: WizardAnswers,
  workspace?: WorkspaceInfo,
): boolean {
  const w = g.when;
  if (!w) return true;
  if (w.frameworks?.some((f) => stack.frameworks.includes(f as AutomationFramework))) return true;
  if (w.language && stack.language && w.language.includes(stack.language)) return true;
  if (w.performance?.some((p) => stack.performance.includes(p))) return true;
  if (w.security?.some((s) => (stack.security ?? []).includes(s))) return true;
  if (w.mcp?.some((m) => mcpEnabled(m, answers))) return true;
  if (w.multiRepo === true && workspace !== undefined) return true;
  return false;
}

/**
 * (R-091) The guideline **names** deployed for this install: the recorded /
 * wizard-overridden set when present (honored verbatim — the source of truth
 * `update`/`doctor` read back), else a fresh `when` evaluation against the
 * stack/choices/workspace. The same "recorded set wins over a fresh evaluation"
 * pattern `update` uses for `DEVELOPER_REPOS` / `MULTI_REPO_RULE` (R-088), so a
 * migration is byte-identical to the live scaffold and never silently strips a
 * guideline the user kept.
 */
export function resolveGuidelineNames(
  stack: DetectedStack,
  answers: WizardAnswers,
  workspace?: WorkspaceInfo,
): string[] {
  if (answers.guidelines) return answers.guidelines;
  return GUIDELINES.filter((g) => guidelineApplies(g, stack, answers, workspace)).map((g) => g.name);
}

export interface ScaffoldInput {
  /**
   * The **scan root** — the directory the tool inspects and reads source from. In
   * single-repo mode this is also where files are written. In multi-repo mode
   * (R-083) it is the *parent* folder holding several repos, and `writeRoot` points
   * at the chosen test repo inside it.
   */
  root: string;
  /**
   * (R-083) The **write root** — the only directory orchestration artifacts (and
   * the manifest) are written into. When omitted, `writeRoot === root` (today's
   * single-repo behavior). When present (multi-repo), it is the chosen test repo;
   * `root` keeps its meaning as the scan root.
   */
  writeRoot?: string;
  /**
   * (R-083) Multi-repo workspace topology — the chosen test repo + the read-only
   * developer repos, relative to the parent. Recorded in the manifest and used to
   * render the `DEVELOPER_REPOS` source-reference section (R-084) and the
   * `.code-workspace` file (R-086). Absent ⇒ single-repo scaffold.
   */
  workspace?: WorkspaceInfo;
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
  // (R-084) External developer-repo source-reference section; renders to "" on a
  // single-repo scaffold, so the surrounding docs stay byte-identical to before.
  "DEVELOPER_REPOS",
  // (R-085) The multi-repo write-boundary rule injected into the root config + write
  // skills; renders to "" on a single-repo scaffold (no dev repos to protect).
  "MULTI_REPO_RULE",
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
  const { root, adapter, stack, answers, workspace } = input;
  // The write root is the chosen test repo in multi-repo mode (R-083); in
  // single-repo mode it is the scan root, so behavior is unchanged.
  const writeRoot = input.writeRoot ?? root;
  const generatedAt = new Date().toISOString();
  // Inventory the *write root* (the test repo) before writing the scaffold, so the
  // phase-1 repo map reflects the test repo's own layout, not the parent's and not
  // our own generated files. The external developer repos (R-084) are referenced
  // separately via the DEVELOPER_REPOS section.
  const vars = buildVars(
    stack,
    answers,
    generatedAt,
    repoMapMarkdown(writeRoot),
    workspace?.devRepos ?? [],
    workspace?.testRepo,
  );

  // (R-091) Resolve the stack-aware guideline set once (honoring a wizard override
  // if present), record it in the manifest's choices, and render only those files.
  // Recording the resolved names is what lets `update`/`doctor` re-derive the exact
  // deployed set without re-evaluating `when` (the R-088 pattern).
  const effectiveAnswers: WizardAnswers = {
    ...answers,
    guidelines: resolveGuidelineNames(stack, answers, workspace),
  };
  const files = scaffoldFiles(adapter, stack, effectiveAnswers, workspace);

  const results: WriteResult[] = [];
  const fileBaselines: Record<string, FileBaseline> = {};
  for (const f of files) {
    const content = render(f.content, vars);
    results.push(writeFileIfAbsent(join(writeRoot, f.rel), content));
    // Record the canonical baseline (hash + content) regardless of
    // created/skipped, so `update` (R-034) has a pristine fingerprint to compare
    // against and (R-039) the rendered base content to merge from later.
    fileBaselines[f.rel] = fileBaseline(content);
  }

  // (R-086) Emit the VS Code `.code-workspace` into the *parent* — the one
  // sanctioned write outside the write root — listing the test repo first and the
  // dev repos as read-only folders. Only in multi-repo mode; records its path in
  // the workspace block so `doctor`/`update` know about it.
  const recordedWorkspace: WorkspaceInfo | undefined = workspace
    ? { ...workspace, ...emitCodeWorkspace(root, workspace, results) }
    : undefined;

  const manifest: ScaffoldManifest = {
    schemaVersion: 1,
    generatedAt,
    ...(input.toolVersion ? { toolVersion: input.toolVersion } : {}),
    platform: adapter.id,
    stack,
    choices: effectiveAnswers,
    skills: SKILLS.map((s) => s.name),
    ...(recordedWorkspace ? { workspace: recordedWorkspace } : {}),
    files: fileBaselines,
  };
  results.push(
    writeFileIfAbsent(join(writeRoot, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`),
  );

  return results;
}

/**
 * (R-086) Write `<parent>/<parent-name>.code-workspace` listing the test repo
 * first and the developer repos as folders, with `settings."files.readonlyInclude"`
 * globbing the dev folders so VS Code itself blocks edits there — a native editor
 * guardrail layered onto the persuasion (root rule + guideline) and the out-of-loop
 * `doctor` leak check. Pushes its WriteResult and returns the manifest fragment
 * recording the file's path **relative to the test repo** (`../<name>.code-workspace`),
 * so `doctor`/`update` (run with `--root <test-repo>`) can resolve it.
 */
function emitCodeWorkspace(
  parent: string,
  workspace: WorkspaceInfo,
  results: WriteResult[],
): { workspaceFile: string } {
  const parentName = basename(parent) || "workspace";
  const fileName = `${parentName}.code-workspace`;
  const folders = [
    { path: workspace.testRepo, name: `${workspace.testRepo} (QA workspace — writable)` },
    ...workspace.devRepos.map((d) => ({ path: d })),
  ];
  const readonlyInclude: Record<string, boolean> = {};
  for (const d of workspace.devRepos) readonlyInclude[`${d}/**`] = true;
  const content = `${JSON.stringify(
    {
      folders,
      settings: {
        // Pin the developer repos read-only in the editor — the tool and its agents
        // write only into the test repo (see the multi-repo-boundaries guideline).
        "files.readonlyInclude": readonlyInclude,
      },
    },
    null,
    2,
  )}\n`;
  results.push(writeFileIfAbsent(join(parent, fileName), content));
  return { workspaceFile: `../${fileName}` };
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
  workspace?: WorkspaceInfo,
): WriteFile[] {
  // (R-091) Deploy only the stack-relevant guideline subset. Honors the recorded /
  // overridden `answers.guidelines` when present (so `update` re-renders the exact
  // recorded set), else evaluates each guideline's `when`.
  const guidelineNames = new Set(resolveGuidelineNames(stack, answers, workspace));
  return [
    { rel: adapter.rootConfigRel, content: rootConfigMarkdown(SKILLS, adapter.invokeNoun) },
    ...GUIDELINES.filter((g) => guidelineNames.has(g.name)).map((g) => ({
      rel: adapter.guidelineRel(g.name),
      content: deployedGuidelineBody(g),
    })),
    ...FOUNDATION.map((f) => ({ rel: f.rel, content: f.body })),
    ...SKILLS.flatMap((s) => adapter.renderSkill(s)),
    ...adapter.orchestratorFiles(SKILLS),
    adapter.mcpFile({
      framework: answers.automationFramework,
      buildTool: stack.buildTool,
      atlassianMcp: answers.atlassianMcp,
      playwrightMcp: answers.playwrightMcp,
      xrayMcp: answers.xrayMcp,
      markitdownMcp: answers.markitdownMcp,
      observability: stack.observability,
      performance: stack.performance,
    }),
  ];
}

/**
 * (R-079) The repo-root-relative paths phase 1 writes for one platform: the
 * template set of `scaffoldFiles` **plus** the generated manifest. Path-only and
 * context-independent — every rel is fixed by the adapter + the static
 * `SKILLS`/`GUIDELINES`/`FOUNDATION` model, and the MCP file path is constant, so
 * a neutral ctx suffices. Single source of truth for `doctor`'s structure check:
 * the expected-file contract lives next to `scaffoldFiles` (its content sibling)
 * and the manifest path is the one exported `MANIFEST_REL`, so the two can't drift.
 */
export function expectedFilePaths(adapter: PlatformAdapter, guidelineNames?: string[]): string[] {
  // (R-091) The expected guideline set is manifest-driven: `doctor` passes the
  // recorded `manifest.choices.guidelines`, so it expects exactly the deployed
  // subset. Absent (a direct call, or a pre-R-091 manifest), fall back to all
  // guidelines — matching a pre-R-091 scaffold, which deployed every guideline.
  const guidelineSet = guidelineNames ? new Set(guidelineNames) : null;
  const files = new Set<string>();
  files.add(adapter.rootConfigRel);
  for (const g of GUIDELINES) {
    if (guidelineSet === null || guidelineSet.has(g.name)) files.add(adapter.guidelineRel(g.name));
  }
  for (const f of FOUNDATION) files.add(f.rel);
  for (const s of SKILLS) for (const w of adapter.renderSkill(s)) files.add(w.rel);
  for (const w of adapter.orchestratorFiles(SKILLS)) files.add(w.rel);
  files.add(adapter.mcpFile({ framework: "unknown", buildTool: "unknown" }).rel);
  files.add(MANIFEST_REL);
  return [...files];
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
  /**
   * (R-084) Developer (source) repo names, relative to the parent, in multi-repo
   * mode. Renders the `DEVELOPER_REPOS` source-reference section. Empty (the
   * default) ⇒ the section renders to "" and the surrounding docs stay
   * byte-identical to a single-repo scaffold.
   */
  developerRepos: string[] = [],
  /**
   * (R-085) The chosen test repo's name, used in the multi-repo write-boundary
   * rule. Omitted (the default) ⇒ `MULTI_REPO_RULE` renders to "".
   */
  testRepo?: string,
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
    DEVELOPER_REPOS: renderDeveloperRepos(developerRepos),
    MULTI_REPO_RULE: renderMultiRepoRule(testRepo, developerRepos),
  };
}

/**
 * (R-085) The load-bearing multi-repo write-boundary rule, rendered as a blockquote
 * that ends with a blank line so it slots in front of the next block. Empty when
 * not in multi-repo mode, so single-repo output is byte-identical to before.
 */
function renderMultiRepoRule(testRepo: string | undefined, developerRepos: string[]): string {
  if (!testRepo || developerRepos.length === 0) return "";
  return (
    `> **Workspace boundary (non-negotiable — survives compaction):** the only writable ` +
    `area is the test repo \`${testRepo}\`. The developer repos (${developerRepos
      .map((d) => `\`../${d}/\``)
      .join(", ")}) are **read-only source** — read them at \`../<repo>/file:line\`, never ` +
    `create, edit, or delete files in them. See the \`multi-repo-boundaries\` guideline.\n\n`
  );
}

function writeFileIfAbsent(absPath: string, content: string): WriteResult {
  if (existsSync(absPath)) {
    return { path: absPath, status: "skipped" };
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return { path: absPath, status: "created" };
}
