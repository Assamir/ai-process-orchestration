import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, copilotAdapter, resultServers, scaffold } from "../src/index.js";
import type { DetectedStack, WizardAnswers } from "../src/index.js";
import { tempProject } from "./helpers.js";

describe("resultServers (MCP legibility)", () => {
  it("wires a filesystem server over Playwright report + traces for playwright-ts", () => {
    const servers = resultServers({ framework: "playwright-ts", buildTool: "npm" });
    const s = servers["playwright-results"];
    expect(s).toBeDefined();
    expect(s!.args).toContain("@modelcontextprotocol/server-filesystem");
    expect(s!.args).toEqual(expect.arrayContaining(["./playwright-report", "./test-results"]));
  });

  it("uses the right report dir per build tool for playwright-java", () => {
    expect(resultServers({ framework: "playwright-java", buildTool: "maven" })["playwright-results"]!.args).toContain(
      "./target/surefire-reports",
    );
    expect(resultServers({ framework: "playwright-java", buildTool: "gradle" })["playwright-results"]!.args).toContain(
      "./build/reports/tests",
    );
  });

  it("returns no servers for non-Playwright frameworks (empty stub)", () => {
    expect(resultServers({ framework: "restassured", buildTool: "maven" })).toEqual({});
    expect(resultServers({ framework: "unknown", buildTool: "unknown" })).toEqual({});
  });
});

describe("scaffold wires MCP results into the platform config", () => {
  const stack: DetectedStack = {
    language: "node",
    buildTool: "npm",
    frameworks: ["playwright-ts"],
    primaryFramework: "playwright-ts",
    linters: [],
    manifests: ["package.json"],
  };
  const answers: WizardAnswers = {
    automationFramework: "playwright-ts",
    reportLanguage: "en",
    autonomyLevel: "medium",
    qaConventions: "x",
  };

  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("Claude .mcp.json under mcpServers", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["playwright-results"]).toBeDefined();
  });

  it("Copilot .vscode/mcp.json under servers", () => {
    scaffold({ root: project.dir, adapter: copilotAdapter, stack, answers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".vscode/mcp.json"), "utf8"));
    expect(mcp.servers["playwright-results"]).toBeDefined();
  });
});
