import type { AutomationFramework, BuildTool } from "../types.js";

/** A stdio MCP server entry (command + args, optional env). Same shape both platforms. */
export interface McpServer {
  command: string;
  args: string[];
  /** Environment passed to the server. Values may use `${VAR}` indirection. */
  env?: Record<string, string>;
}

export interface McpContext {
  framework: AutomationFramework;
  buildTool: BuildTool;
  /** Wire the optional local Atlassian (Jira + Confluence) MCP server. */
  atlassianMcp?: boolean;
}

/**
 * MCP servers that make **test results legible to the agent** — the QA analog of
 * Codex's Chrome DevTools / observability wiring. For Playwright we expose the
 * HTML report + traces/screenshots via a read-only filesystem server so `rca` and
 * `test-automate` can read outcomes directly instead of relying on copy-paste.
 *
 * Returns server entries keyed by name; both adapters wrap them in their own JSON
 * envelope (`mcpServers` for Claude, `servers` for Copilot). Only `unknown`
 * (no detected framework) returns `{}`.
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
    case "restassured":
    case "junit5":
    case "testng":
      // JVM runners write Surefire/Failsafe XML (or Gradle's test reports) plus a
      // Serenity site when used; conventional dirs differ by build tool.
      return { "jvm-results": filesystem(jvmReportDirs(ctx.buildTool)) };
    default:
      return {};
  }
}

/** Conventional Surefire/Serenity report directories for a JVM stack, by build tool. */
function jvmReportDirs(buildTool: BuildTool): string[] {
  return buildTool === "gradle"
    ? ["./build/reports/tests", "./build/reports/serenity"]
    : ["./target/surefire-reports", "./target/site/serenity"];
}

/** Read-only filesystem MCP server scoped to the given result directories. */
function filesystem(dirs: string[]): McpServer {
  return {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", ...dirs],
  };
}

/**
 * Optional, local, custom-built **Atlassian** MCP server exposing Jira +
 * Confluence tools so `ticket-review` reads tickets and linked specs directly
 * instead of relying on pasted text. Off unless the wizard opts in.
 *
 * Secrets are never written as values: the launch path and credentials are
 * `${VAR}` indirections the user supplies via the environment. Each adapter
 * renders the platform-correct interpolation token.
 */
export function ticketingServers(ctx: McpContext): Record<string, McpServer> {
  if (!ctx.atlassianMcp) return {};
  return {
    atlassian: {
      command: "node",
      args: ["${ATLASSIAN_MCP_PATH}"],
      env: {
        ATLASSIAN_URL: "${ATLASSIAN_URL}",
        ATLASSIAN_EMAIL: "${ATLASSIAN_EMAIL}",
        ATLASSIAN_API_TOKEN: "${ATLASSIAN_API_TOKEN}",
      },
    },
  };
}

/** Every MCP server a scaffold wires: result-legibility plus optional ticketing. */
export function mcpServers(ctx: McpContext): Record<string, McpServer> {
  return { ...resultServers(ctx), ...ticketingServers(ctx) };
}
