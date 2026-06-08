import type { McpContext } from "../model/mcp.js";
import type { LogicalSkill } from "../model/skills.js";
import type { PlatformId, WriteFile } from "../types.js";

/**
 * Maps a logical artifact (root config, guideline, skill, orchestrator, MCP) to a
 * platform-specific path + frontmatter. Both implementations live in core so the
 * parity test can render the full suite for each platform side by side.
 *
 * Methods return *raw* WriteFiles (placeholders intact); the scaffold orchestrator
 * renders phase-1 vars centrally and writes skip-if-exists.
 */
export interface PlatformAdapter {
  readonly id: PlatformId;
  /** How the root config refers to running a skill, e.g. "skill" | "prompt". */
  readonly invokeNoun: string;
  /** Path of the lean root config, relative to the repo root. */
  readonly rootConfigRel: string;
  /** Path of a guideline doc by logical name. */
  guidelineRel(name: string): string;
  /** Render one logical skill to this platform's surface (1+ files). */
  renderSkill(skill: LogicalSkill): WriteFile[];
  /** Cross-skill orchestrator files (Copilot agent; Claude returns []). */
  orchestratorFiles(skills: LogicalSkill[]): WriteFile[];
  /** The MCP config for this platform, wiring result-legibility servers from `ctx`. */
  mcpFile(ctx: McpContext): WriteFile;
}
