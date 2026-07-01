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
  /**
   * (R-094) Extra `settings` keys for the multi-repo `.code-workspace`, given the
   * test repo's parent-relative path. Copilot must hardcode `chat.*FilesLocations`
   * pointing at the test repo's `.github/**`, because VS Code does not auto-discover
   * a non-root folder's `.github/` in a multi-root workspace (microsoft/vscode#296972),
   * so `/qa-init` and the orchestrator never surface otherwise. Claude returns `{}`
   * (it reads `.claude/skills` directly and ignores `.code-workspace`).
   */
  workspaceSettings(testRepo: string): Record<string, unknown>;
  /**
   * (R-097) Repo-root-relative globs of **this platform's orchestration config** —
   * the writable area besides the test subtree in the embedded topology. Used to
   * build the editor guardrail's `files.readonlyExclude` carve-out (single-host
   * `.vscode/settings.json`; multi-host `.code-workspace`), so the host's config
   * dirs stay writable while the rest of its source is read-only. Coarse directory
   * globs — a defense layer, not the authoritative boundary (that is the root rule
   * + `doctor`).
   */
  configGlobs(): string[];
  /** The MCP config for this platform, wiring result-legibility servers from `ctx`. */
  mcpFile(ctx: McpContext): WriteFile;
}
