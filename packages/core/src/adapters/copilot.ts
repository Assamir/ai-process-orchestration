import type { McpContext } from "../model/mcp.js";
import { resultServers } from "../model/mcp.js";
import type { LogicalSkill } from "../model/skills.js";
import type { WriteFile } from "../types.js";
import type { PlatformAdapter } from "./types.js";

const READ_TOOLS = ["codebase", "search"];
const WRITE_TOOLS = ["codebase", "search", "editFiles", "runCommands"];

/**
 * GitHub Copilot (VS Code) adapter: .github/copilot-instructions.md +
 * .github/instructions/*.instructions.md + .github/prompts/*.prompt.md +
 * a .github/agents/qa-orchestrator.agent.md router + .vscode/mcp.json.
 */
export const copilotAdapter: PlatformAdapter = {
  id: "copilot",
  invokeNoun: "prompt",
  rootConfigRel: ".github/copilot-instructions.md",

  guidelineRel(name: string): string {
    return `.github/instructions/${name}.instructions.md`;
  },

  renderSkill(skill: LogicalSkill): WriteFile[] {
    const tools = skill.readOnly ? READ_TOOLS : WRITE_TOOLS;
    const content = `---
description: ${skill.description}
mode: agent
tools: [${tools.map((t) => `'${t}'`).join(", ")}]
---

# ${skill.name}

${skill.body}

---
*Reads:* ${list(skill.reads)} · *Writes:* ${list(skill.writes)}
`;
    return [{ rel: `.github/prompts/${skill.name}.prompt.md`, content }];
  },

  orchestratorFiles(skills: LogicalSkill[]): WriteFile[] {
    const rows = skills
      .map((s) => `- \`/${s.name}\`${s.readOnly ? " *(read-only)*" : ""} — ${s.description}`)
      .join("\n");
    const content = `---
description: QA-process orchestrator. Routes test work through the QA skill suite. Output in {{REPORT_LANGUAGE_NAME}}.
tools: ['codebase', 'search', 'editFiles', 'runCommands']
user-invokable: true
argument-hint: describe the ticket or test work to start
target: vscode
---

# QA orchestrator

You coordinate the QA-process skills. Knowledge lives in \`context/\`; read it before
acting and update it after. Respect agent autonomy **{{AUTONOMY_LEVEL}}** and never
weaken the iron QA rule (tests in **{{AUTOMATION_FRAMEWORK}}**).

## Workflow

1. Open or create a work-item: run the \`/qa-new\` prompt (id = \`<stream>-<slug>\`, stable).
2. Drive it: \`/ticket-review\` → \`/test-plan\` or \`/test-case-design\` → \`/automation-bootstrapper\` or \`/test-automate\` → run → \`/rca\` on failure → \`/qa-review\` → \`/qa-archive\`.
3. Run each step as its prompt. State of record is \`context/\`.

## Skills (run as \`/<name>\` prompts)

${rows}
`;
    return [{ rel: ".github/agents/qa-orchestrator.agent.md", content }];
  },

  mcpFile(ctx: McpContext): WriteFile {
    return {
      rel: ".vscode/mcp.json",
      content: `${JSON.stringify({ servers: resultServers(ctx) }, null, 2)}\n`,
    };
  },
};

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}
