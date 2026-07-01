// Public API of @qa-orch/core, consumed (and bundled) by the leaf packages.

export * from "./types.js";
export { detectStack } from "./detect/index.js";
export {
  buildRepoInventory,
  renderRepoInventory,
  repoMapMarkdown,
  enumerateRepos,
  chooseTestRepo,
  enumerateTestSubtrees,
  chooseTestSubtree,
  hasDedicatedTestRepo,
  renderDeveloperRepos,
  type RepoInventory,
} from "./detect/repo-map.js";
export {
  defaultAnswers,
  runWizard,
  defaultWorkspace,
  runWorkspaceWizard,
  runEmbeddedWizard,
  resolveEmbeddedWorkspace,
} from "./wizard/index.js";
export {
  frameworkLabel,
  frameworkChoices,
  defaultQaConventions,
} from "./labels.js";
export { render } from "./render.js";
export { SKILLS, type LogicalSkill } from "./model/skills.js";
export {
  ARTIFACTS,
  tpl,
  docTier,
  frontmatterKeys,
  frontmatterList,
  pathIsPillar,
  PILLAR_PREFIXES,
  DURABLE_DOC_FRONTMATTER,
  RUNTIME_DOC_FRONTMATTER,
  type ArtifactTemplate,
  type DocTier,
  type Pillar,
} from "./model/artifacts.js";
export {
  mdToJira,
  JIRA_CONVERSION_TABLE,
  JIRA_TYPE_SECTIONS,
  type JiraTicketType,
} from "./model/jira.js";
export {
  rootConfigMarkdown,
  GUIDELINES,
  FOUNDATION,
  deployedGuidelineBody,
  fullGuidePointer,
  GUIDELINE_DOCS_DIR,
  type Guideline,
  type GuidelineWhen,
} from "./model/context.js";
export { resultServers, browserServers, ticketingServers, fetchServers, mcpServers, type McpServer, type McpContext } from "./model/mcp.js";
export type { PlatformAdapter } from "./adapters/types.js";
export { claudeAdapter } from "./adapters/claude.js";
export { copilotAdapter } from "./adapters/copilot.js";
export {
  scaffold,
  type ScaffoldInput,
  PHASE1_VAR_NAMES,
  guidelineApplies,
  resolveGuidelineNames,
} from "./scaffold/index.js";
export {
  runUpdate,
  compareToolVersions,
  type UpdateAction,
  type UpdateItem,
  type UpdateReport,
  type VersionDirection,
  type VersionInfo,
} from "./update/index.js";
export {
  computeChangelog,
  type Changelog,
  type ChangelogEntry,
  type ChangelogChange,
  type ChangelogKind,
} from "./update/changelog.js";
export {
  merge3,
  applyResolutions,
  diffLines,
  CONFLICT_MARKERS,
  type MergeResult,
  type MergeRegion,
  type ConflictChoice,
} from "./update/merge.js";
export {
  resolveConflicts,
  walkChanges,
  type ConflictFile,
  type ChangeItem,
  type WalkResult,
} from "./update/resolve.js";
export {
  runDoctor,
  fixLinks,
  type DoctorFinding,
  type DoctorReport,
  type DoctorFixReport,
  type LinkFix,
  type LinkFixClass,
} from "./doctor/index.js";
export { runCli, type CliMeta } from "./cli.js";
export {
  renderSkillCatalog,
  renderSkillFlow,
  renderOrchestrationGraph,
  nextSkills,
  triggerLine,
  procedureSteps,
} from "./docs/skill-flows.js";
export {
  renderGuidelineDoc,
  renderGuidelinesIndex,
  renderAllGuidelineDocs,
  guidelineDocRel,
} from "./docs/guideline-flows.js";
