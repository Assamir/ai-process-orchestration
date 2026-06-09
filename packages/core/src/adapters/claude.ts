import type { McpContext } from "../model/mcp.js";
import { mcpServers } from "../model/mcp.js";
import type { LogicalSkill } from "../model/skills.js";
import type { WriteFile } from "../types.js";
import type { PlatformAdapter } from "./types.js";

const READ_TOOLS = ["Read", "Grep", "Glob"];
const WRITE_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];

/** Claude Code adapter: CLAUDE.md + .claude/skills/<name>/SKILL.md + .mcp.json. */
export const claudeAdapter: PlatformAdapter = {
  id: "claude",
  invokeNoun: "skill",
  rootConfigRel: "CLAUDE.md",

  guidelineRel(name: string): string {
    return `.ai/guidelines/${name}.md`;
  },

  renderSkill(skill: LogicalSkill): WriteFile[] {
    const tools = (skill.readOnly ? READ_TOOLS : WRITE_TOOLS).join(", ");
    const content = `---
name: ${skill.name}
description: ${skill.description}
model: ${skill.suggestedModel}
allowed-tools: ${tools}
---

# ${skill.name}

${skill.body}

---
*Reads:* ${list(skill.reads)} · *Writes:* ${list(skill.writes)}
`;
    return [{ rel: `.claude/skills/${skill.name}/SKILL.md`, content }];
  },

  orchestratorFiles(): WriteFile[] {
    // Claude routes via the skills + CLAUDE.md map; no separate agent file.
    return [];
  },

  mcpFile(ctx: McpContext): WriteFile {
    // Claude Code expands `${VAR}` in .mcp.json string values directly.
    return {
      rel: ".mcp.json",
      content: `${JSON.stringify({ mcpServers: mcpServers(ctx) }, null, 2)}\n`,
    };
  },
};

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}
