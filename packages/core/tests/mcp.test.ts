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

  it("wires a filesystem server over reports + artifacts for pytest (R-006)", () => {
    const s = resultServers({ framework: "pytest", buildTool: "poetry" })["pytest-results"];
    expect(s).toBeDefined();
    expect(s!.args).toContain("@modelcontextprotocol/server-filesystem");
    expect(s!.args).toEqual(expect.arrayContaining(["./reports", "./test-results"]));
  });

  it("wires Surefire/Serenity report dirs for JVM stacks per build tool (R-008)", () => {
    const maven = resultServers({ framework: "restassured", buildTool: "maven" })["jvm-results"];
    expect(maven).toBeDefined();
    expect(maven!.args).toContain("@modelcontextprotocol/server-filesystem");
    expect(maven!.args).toEqual(expect.arrayContaining(["./target/surefire-reports", "./target/site/serenity"]));

    const gradle = resultServers({ framework: "junit5", buildTool: "gradle" })["jvm-results"];
    expect(gradle!.args).toEqual(expect.arrayContaining(["./build/reports/tests", "./build/reports/serenity"]));

    // TestNG rides the same JVM layout.
    expect(resultServers({ framework: "testng", buildTool: "maven" })["jvm-results"]).toBeDefined();
  });

  it("returns no servers only when the framework is unknown (empty stub)", () => {
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

  it("seeds the pytest-results server when scaffolding a pytest repo (R-006)", () => {
    const pyStack: DetectedStack = {
      language: "python",
      buildTool: "poetry",
      frameworks: ["pytest"],
      primaryFramework: "pytest",
      linters: ["ruff"],
      manifests: ["pyproject.toml"],
    };
    const pyAnswers: WizardAnswers = { ...answers, automationFramework: "pytest" };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: pyStack, answers: pyAnswers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["pytest-results"]).toBeDefined();
  });

  it("seeds the jvm-results server when scaffolding a RestAssured (Maven) repo (R-008)", () => {
    const jvmStack: DetectedStack = {
      language: "java",
      buildTool: "maven",
      frameworks: ["restassured", "junit5"],
      primaryFramework: "restassured",
      linters: [],
      manifests: ["pom.xml"],
    };
    const jvmAnswers: WizardAnswers = { ...answers, automationFramework: "restassured" };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: jvmStack, answers: jvmAnswers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["jvm-results"]).toBeDefined();
  });
});
