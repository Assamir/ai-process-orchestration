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
  /**
   * Cross-run observability tools detected in the stack (e.g. `allure`). When
   * present, their durable result/history dirs are added to the result server
   * so legibility extends past a single static report directory (R-012).
   */
  observability?: string[];
}

/**
 * MCP servers that make **test results legible to the agent** — the QA analog of
 * Codex's Chrome DevTools / observability wiring. For Playwright we expose the
 * HTML report + traces/screenshots via a read-only filesystem server so `qa-rca` and
 * `qa-test-automate` can read outcomes directly instead of relying on copy-paste.
 *
 * Returns server entries keyed by name; both adapters wrap them in their own JSON
 * envelope (`mcpServers` for Claude, `servers` for Copilot). Only `unknown`
 * (no detected framework) returns `{}`.
 */
export function resultServers(ctx: McpContext): Record<string, McpServer> {
  const base = baseResult(ctx);
  // Allure keeps durable cross-run history (`allure-report/history`) + per-run
  // results — legibility *beyond* a single static report dir, which is what
  // `qa-metrics` needs for flakiness/trends (R-012).
  const allure = ctx.observability?.includes("allure") ? ["./allure-results", "./allure-report"] : [];

  if (base) return { [base.name]: filesystem([...base.dirs, ...allure]) };
  // No framework result server (unknown stack), but Allure may still be wired.
  return allure.length ? { "allure-results": filesystem(allure) } : {};
}

/** The framework's conventional result dirs and server name, or null when unknown. */
function baseResult(ctx: McpContext): { name: string; dirs: string[] } | null {
  switch (ctx.framework) {
    case "playwright-ts":
      return { name: "playwright-results", dirs: ["./playwright-report", "./test-results"] };
    case "playwright-java": {
      // Playwright-Java rides the JVM runner's reports; trace dir is conventionally test-results.
      const reportDir = ctx.buildTool === "gradle" ? "./build/reports/tests" : "./target/surefire-reports";
      return { name: "playwright-results", dirs: [reportDir, "./test-results"] };
    }
    case "pytest":
      // pytest writes where configured; the common conventions are a pytest-html
      // report + a JUnit XML (`--junitxml`) under ./reports, with artifacts in
      // ./test-results. Expose both read-only so qa-rca/qa-test-automate read outcomes.
      return { name: "pytest-results", dirs: ["./reports", "./test-results"] };
    case "restassured":
    case "junit5":
    case "testng":
      // JVM runners write Surefire/Failsafe XML (or Gradle's test reports) plus a
      // Serenity site when used; conventional dirs differ by build tool.
      return { name: "jvm-results", dirs: jvmReportDirs(ctx.buildTool) };
    default:
      return null;
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
 * Confluence tools so `qa-ticket-review` reads tickets and linked specs directly
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
