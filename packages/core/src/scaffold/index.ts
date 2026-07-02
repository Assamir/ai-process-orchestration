import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { renderCostDashboard } from "../docs/cost-dashboard.js";
import { CAPTURE_SCRIPT } from "../model/capture-script.js";
import {
  CAPTURE_TASK_LABEL,
  captureTask,
  TELEMETRY_DIR,
  TELEMETRY_INDEX_REL,
  TELEMETRY_INDEX_SEED,
  TELEMETRY_README,
  VSCODE_TASKS_REL,
  vscodeTasksSeed,
} from "../model/telemetry.js";
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
    workspace?.testSubpath,
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
  // dev repos as read-only folders. Records its path in the workspace block so
  // `doctor`/`update` know about it.
  //
  // (R-095/R-097) Single-host embedded (`testRepo === "."`) has no parent multi-root
  // workspace: the host repo *is* the target, and its editor guardrail is a
  // `.vscode/settings.json` at the host root (shallow-merged, never clobbered), not
  // a `.code-workspace`. Dedicated multi-repo and multi-host embedded emit the
  // parent `.code-workspace` (embedded adds a `readonlyExclude` carve-out for the
  // host's test subtree + config). Single-host records the workspace block (with
  // `testSubpath`) but no `workspaceFile`.
  let recordedWorkspace: WorkspaceInfo | undefined;
  if (workspace) {
    if (workspace.testRepo === ".") {
      if (workspace.testSubpath) emitEmbeddedSettings(writeRoot, workspace.testSubpath, adapter, results);
      recordedWorkspace = workspace;
    } else {
      recordedWorkspace = { ...workspace, ...emitCodeWorkspace(root, workspace, adapter, results) };
    }
  }

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

  // (R-103) Install the automatic capture trigger. Shallow-merged into any existing
  // `.vscode/tasks.json` (the `emitEmbeddedSettings` precedent), not baseline-tracked,
  // so a user's own tasks are preserved and `update` treats it as drift.
  emitVscodeTasks(writeRoot, results);

  return results;
}

/**
 * (R-103) Install the telemetry capture task into `.vscode/tasks.json`, without
 * clobbering the user's own tasks — mirroring {@link emitEmbeddedSettings}:
 *
 * - no file → write the seeded `tasks.json` with our task;
 * - a file that parses as JSON → append our task iff no task with our label is
 *   already present (idempotent), preserving every existing task/field;
 * - a file that does not parse (JSONC with comments/trailing commas) → leave it
 *   untouched and let `doctor` report the missing trigger (warn).
 *
 * Not recorded in the manifest baseline (like the `.code-workspace` / embedded
 * settings), so `update` reports it as drift and never rewrites it.
 */
function emitVscodeTasks(writeRoot: string, results: WriteResult[]): void {
  const abs = join(writeRoot, VSCODE_TASKS_REL);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(vscodeTasksSeed(), null, 2)}\n`, "utf8");
    results.push({ path: abs, status: "created" });
    return;
  }
  let doc: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(abs, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) doc = parsed as Record<string, unknown>;
  } catch {
    doc = null; // JSONC / malformed — leave untouched, doctor reports it.
  }
  if (doc === null) {
    results.push({ path: abs, status: "skipped" });
    return;
  }
  const tasks = Array.isArray(doc.tasks) ? (doc.tasks as Array<Record<string, unknown>>) : [];
  if (tasks.some((t) => t && t.label === CAPTURE_TASK_LABEL)) {
    results.push({ path: abs, status: "skipped" });
    return;
  }
  tasks.push(captureTask());
  doc.tasks = tasks;
  if (typeof doc.version !== "string") doc.version = "2.0.0";
  writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  results.push({ path: abs, status: "created" });
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
  adapter: PlatformAdapter,
  results: WriteResult[],
): { workspaceFile: string } {
  const parentName = basename(parent) || "workspace";
  const fileName = `${parentName}.code-workspace`;
  // (R-097) Embedded multi-host: the host repo (`testRepo`) is itself developer
  // source — read-only except its test subtree + config, carved out below.
  const embedded = workspace.testSubpath !== undefined;
  const folders = [
    {
      path: workspace.testRepo,
      name: embedded
        ? `${workspace.testRepo} (host — test subtree writable)`
        : `${workspace.testRepo} (QA workspace — writable)`,
    },
    ...workspace.devRepos.map((d) => ({ path: d })),
  ];
  const readonlyInclude: Record<string, boolean> = {};
  for (const d of workspace.devRepos) readonlyInclude[`${d}/**`] = true;
  // In embedded mode pin the whole host read-only, then carve back the writable set.
  const readonlyExclude: Record<string, boolean> = {};
  if (embedded) {
    readonlyInclude[`${workspace.testRepo}/**`] = true;
    readonlyExclude[`${workspace.testRepo}/${workspace.testSubpath}/**`] = true;
    for (const g of adapter.configGlobs()) readonlyExclude[`${workspace.testRepo}/${g}`] = true;
  }
  const content = `${JSON.stringify(
    {
      folders,
      settings: {
        // Pin the developer repos (and, in embedded mode, the host source) read-only
        // in the editor — the tool and its agents write only into the writable set
        // (see the multi-repo-boundaries guideline).
        "files.readonlyInclude": readonlyInclude,
        // (R-097) Embedded carve-out: the host's test subtree + orchestration config
        // stay writable inside the otherwise read-only host repo.
        ...(embedded ? { "files.readonlyExclude": readonlyExclude } : {}),
        // (R-094) Platform-specific chat-discovery locations. Copilot must pin its
        // `.github/**` under the test repo so prompts/agents surface in a multi-root
        // workspace (microsoft/vscode#296972); Claude contributes nothing.
        ...adapter.workspaceSettings(workspace.testRepo),
      },
    },
    null,
    2,
  )}\n`;
  results.push(writeFileIfAbsent(join(parent, fileName), content));
  return { workspaceFile: `../${fileName}` };
}

/**
 * (R-097) Single-host embedded editor guardrail: a `.vscode/settings.json` at the
 * host root that pins the whole repo read-only (`files.readonlyInclude`) and carves
 * back the writable set (`files.readonlyExclude`: the test subtree + the platform's
 * orchestration config globs). **Shallow, non-clobbering merge**, mirroring the
 * R-034/R-039 "never overwrite user content" principle:
 *
 * - no file → write ours;
 * - a file that parses as JSON → add only the readonly keys we're missing,
 *   preserving every existing value (never overwrite a key the user already set);
 * - a file that does not parse (e.g. JSONC with comments) → leave it untouched and
 *   let `doctor` report the missing guardrail.
 *
 * The result is **not** recorded in the manifest baseline (like the `.code-workspace`),
 * so `update` treats it as drift → report, never a rewrite (R-098/D5).
 */
function emitEmbeddedSettings(
  hostRoot: string,
  testSubpath: string,
  adapter: PlatformAdapter,
  results: WriteResult[],
): void {
  const rel = ".vscode/settings.json";
  const abs = join(hostRoot, rel);
  const readonlyInclude = { "**": true };
  const readonlyExclude: Record<string, boolean> = { [`${testSubpath}/**`]: true };
  for (const g of adapter.configGlobs()) readonlyExclude[g] = true;
  const ours: Record<string, unknown> = {
    "files.readonlyInclude": readonlyInclude,
    "files.readonlyExclude": readonlyExclude,
  };

  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(ours, null, 2)}\n`, "utf8");
    results.push({ path: abs, status: "created" });
    return;
  }

  let existing: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(abs, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed as Record<string, unknown>;
  } catch {
    existing = null; // JSONC / malformed — leave untouched, doctor reports it.
  }
  if (existing === null) {
    results.push({ path: abs, status: "skipped" });
    return;
  }
  let changed = false;
  for (const key of Object.keys(ours)) {
    if (!(key in existing)) {
      existing[key] = ours[key];
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(abs, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    results.push({ path: abs, status: "created" });
  } else {
    results.push({ path: abs, status: "skipped" });
  }
}

/** Canonical scaffold path of the phase-2 handoff manifest, repo-root-relative. */
export const MANIFEST_REL = "context/.scaffold/manifest.json";

/**
 * (R-100 → R-104) The **telemetry area** — the AI cost & value cockpit's committed
 * files, platform-agnostic (identical on both platforms, so parity-safe like the
 * `context/` skeleton). Grows across the epic: the README + seeded aggregate
 * (R-100), the zero-dep capture script (R-101), and the self-contained dashboard
 * (R-104). The per-user JSONL logs are written at runtime by the capture script,
 * not seeded here. Skip-if-exists like every scaffold file, so a re-run never
 * clobbers accumulated telemetry.
 */
export function telemetryFiles(): WriteFile[] {
  return [
    { rel: `${TELEMETRY_DIR}/README.md`, content: TELEMETRY_README },
    { rel: TELEMETRY_INDEX_REL, content: TELEMETRY_INDEX_SEED },
    { rel: `${TELEMETRY_DIR}/capture.mjs`, content: CAPTURE_SCRIPT },
    { rel: `${TELEMETRY_DIR}/dashboard.html`, content: renderCostDashboard() },
  ];
}

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
    ...telemetryFiles(),
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
  for (const f of telemetryFiles()) files.add(f.rel);
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
  /**
   * (R-095) The embedded test subtree, relative to the host repo. Present ⇒ the
   * write-boundary rule renders its **embedded** branch (the writable area is
   * `{testSubpath}/` plus the host-root config), independent of `testRepo`.
   * Omitted (the default) ⇒ the dedicated multi-repo / single-repo rule.
   */
  testSubpath?: string,
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
    MULTI_REPO_RULE: renderMultiRepoRule(testRepo, developerRepos, testSubpath),
  };
}

/**
 * (R-085 / R-095) The load-bearing workspace write-boundary rule, rendered as a
 * blockquote that ends with a blank line so it slots in front of the next block.
 * Three cases, in priority order:
 *
 * - **Embedded (R-095)** — `testSubpath` present: the writable area is the test
 *   subtree `{testSubpath}/` plus the orchestration config at the host root; the
 *   rest of the host repo is read-only application source, and any sibling
 *   developer repos are read-only too. Fires for both single-host (`devRepos`
 *   empty) and multi-host.
 * - **Dedicated multi-repo (R-085)** — a `testRepo` + ≥1 `developerRepos`, no
 *   `testSubpath`: the whole test repo is writable, dev repos read-only.
 * - **Single-repo** — neither: renders to "", so output is byte-identical to
 *   before this rule existed.
 */
function renderMultiRepoRule(
  testRepo: string | undefined,
  developerRepos: string[],
  testSubpath?: string,
): string {
  if (testSubpath) {
    const siblings =
      developerRepos.length > 0
        ? ` Sibling developer repos (${developerRepos
            .map((d) => `\`../${d}/\``)
            .join(", ")}) are read-only source too — read them at \`../<repo>/file:line\`.`
        : "";
    return (
      `> **Workspace boundary (non-negotiable — survives compaction):** the only writable ` +
      `area is the test subtree \`${testSubpath}/\` plus the orchestration config at the repo ` +
      `root (\`context/\`, the platform config, the manifest). The rest of this repo is ` +
      `**application source** — read it at \`file:line\`, never create, edit, or delete files ` +
      `outside \`${testSubpath}/\`.${siblings} See the \`multi-repo-boundaries\` guideline.\n\n`
    );
  }
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
