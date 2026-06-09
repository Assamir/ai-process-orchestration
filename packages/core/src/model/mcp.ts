import type { AutomationFramework, BuildTool } from "../types.js";

/** A stdio MCP server entry (command + args). Same shape both platforms. */
export interface McpServer {
  command: string;
  args: string[];
}

export interface McpContext {
  framework: AutomationFramework;
  buildTool: BuildTool;
}

/**
 * MCP servers that make **test results legible to the agent** — the QA analog of
 * Codex's Chrome DevTools / observability wiring. For Playwright we expose the
 * HTML report + traces/screenshots via a read-only filesystem server so `rca` and
 * `test-automate` can read outcomes directly instead of relying on copy-paste.
 *
 * Returns server entries keyed by name; both adapters wrap them in their own JSON
 * envelope (`mcpServers` for Claude, `servers` for Copilot). Frameworks without a
 * results wiring yet (JVM RestAssured/JUnit/TestNG) return `{}` — see roadmap.
 */
export function resultServers(ctx: McpContext): Record<string, McpServer> {
  switch (ctx.framework) {
    case "playwright-ts":
      return { "playwright-results": filesystem(["./playwright-report", "./test-results"]) };
    case "playwright-java": {
      // Playwright-Java rides the JVM runner's reports; trace dir is conventionally test-results.
      const reportDir = ctx.buildTool === "gradle" ? "./build/reports/tests" : "./target/surefire-reports";
      return { "playwright-results": filesystem([reportDir, "./test-results"]) };
    }
    case "pytest":
      // pytest writes where configured; the common conventions are a pytest-html
      // report + a JUnit XML (`--junitxml`) under ./reports, with artifacts in
      // ./test-results. Expose both read-only so rca/test-automate read outcomes.
      return { "pytest-results": filesystem(["./reports", "./test-results"]) };
    default:
      return {};
  }
}

/** Read-only filesystem MCP server scoped to the given result directories. */
function filesystem(dirs: string[]): McpServer {
  return {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", ...dirs],
  };
}
