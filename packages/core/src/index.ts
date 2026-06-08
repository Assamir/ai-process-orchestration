// Public API of @qa-orch/core, consumed (and bundled) by the leaf packages.

export * from "./types.js";
export { detectStack } from "./detect/index.js";
export { defaultAnswers, runWizard } from "./wizard/index.js";
export {
  frameworkLabel,
  frameworkChoices,
  defaultQaConventions,
} from "./labels.js";
export { render } from "./render.js";
export { SKILLS, type LogicalSkill } from "./model/skills.js";
export { rootConfigMarkdown, GUIDELINES, FOUNDATION } from "./model/context.js";
export { resultServers, type McpServer, type McpContext } from "./model/mcp.js";
export type { PlatformAdapter } from "./adapters/types.js";
export { claudeAdapter } from "./adapters/claude.js";
export { copilotAdapter } from "./adapters/copilot.js";
export { scaffold, type ScaffoldInput, PHASE1_VAR_NAMES } from "./scaffold/index.js";
export { runDoctor, type DoctorFinding, type DoctorReport } from "./doctor/index.js";
export { runCli, type CliMeta } from "./cli.js";
