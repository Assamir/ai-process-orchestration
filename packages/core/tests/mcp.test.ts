import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter, copilotAdapter, resultServers, browserServers, ticketingServers, scaffold } from "../src/index.js";
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

  it("extends result legibility past the static report dir with Allure history when detected (R-012)", () => {
    // Allure dirs are appended to the framework's result server, alongside the static dirs.
    const s = resultServers({ framework: "playwright-ts", buildTool: "npm", observability: ["allure"] })["playwright-results"];
    expect(s).toBeDefined();
    expect(s!.args).toEqual(expect.arrayContaining(["./playwright-report", "./allure-results", "./allure-report"]));

    // Even with no framework result server, Allure alone is still made legible.
    const orphan = resultServers({ framework: "unknown", buildTool: "unknown", observability: ["allure"] });
    expect(orphan["allure-results"]).toBeDefined();
    expect(orphan["allure-results"]!.args).toEqual(expect.arrayContaining(["./allure-results", "./allure-report"]));

    // No observability → unchanged, no allure dirs leak in.
    const none = resultServers({ framework: "playwright-ts", buildTool: "npm" })["playwright-results"];
    expect(none!.args).not.toContain("./allure-results");
  });

  it("wires a separate jmeter-results server when JMeter is detected (R-046)", () => {
    // Orthogonal to the functional runner: both the framework + jmeter servers appear.
    const both = resultServers({ framework: "playwright-ts", buildTool: "npm", performance: ["jmeter"] });
    expect(both["playwright-results"]).toBeDefined();
    expect(both["jmeter-results"]).toBeDefined();
    expect(both["jmeter-results"]!.args).toEqual(expect.arrayContaining(["./jmeter-report", "./jmeter-results"]));

    // Even on an unknown functional framework, a JMeter-only repo is still made legible.
    const perfOnly = resultServers({ framework: "unknown", buildTool: "unknown", performance: ["jmeter"] });
    expect(perfOnly["jmeter-results"]).toBeDefined();

    // No performance tooling → no jmeter server leaks in.
    expect(resultServers({ framework: "playwright-ts", buildTool: "npm" })["jmeter-results"]).toBeUndefined();
  });
});

describe("ticketingServers (optional Atlassian MCP)", () => {
  it("wires nothing unless opted in (R-009)", () => {
    expect(ticketingServers({ framework: "playwright-ts", buildTool: "npm" })).toEqual({});
    expect(ticketingServers({ framework: "playwright-ts", buildTool: "npm", atlassianMcp: false })).toEqual({});
  });

  it("wires one combined Atlassian server with env-var indirection, no literal secrets (R-009)", () => {
    const atlassian = ticketingServers({ framework: "playwright-ts", buildTool: "npm", atlassianMcp: true }).atlassian;
    expect(atlassian).toBeDefined();
    expect(atlassian!.command).toBe("node");
    expect(atlassian!.args).toEqual(["${ATLASSIAN_MCP_PATH}"]);
    // Secrets are referenced, never written as values.
    expect(atlassian!.env).toMatchObject({ ATLASSIAN_API_TOKEN: "${ATLASSIAN_API_TOKEN}" });
    for (const v of Object.values(atlassian!.env!)) expect(v).toMatch(/^\$\{[A-Z0-9_]+\}$/);
  });
});

describe("browserServers (optional Playwright browser MCP)", () => {
  it("wires nothing unless opted in (R-023)", () => {
    expect(browserServers({ framework: "playwright-ts", buildTool: "npm" })).toEqual({});
    expect(browserServers({ framework: "playwright-ts", buildTool: "npm", playwrightMcp: false })).toEqual({});
  });

  it("wires the official @playwright/mcp browser server when opted in (R-023)", () => {
    const s = browserServers({ framework: "playwright-ts", buildTool: "npm", playwrightMcp: true })["playwright-browser"];
    expect(s).toBeDefined();
    expect(s!.command).toBe("npx");
    expect(s!.args).toEqual(["-y", "@playwright/mcp@latest"]);
    // No secrets/env — renders identically on both platforms.
    expect(s!.env).toBeUndefined();
  });

  it("is offered regardless of the detected framework (browser MCP is stack-agnostic)", () => {
    expect(browserServers({ framework: "pytest", buildTool: "pip", playwrightMcp: true })["playwright-browser"]).toBeDefined();
  });
});

describe("scaffold wires MCP results into the platform config", () => {
  const stack: DetectedStack = {
    language: "node",
    buildTool: "npm",
    frameworks: ["playwright-ts"],
    primaryFramework: "playwright-ts",
    linters: [],
    observability: [],
    performance: [],
    manifests: ["package.json"],
  };
  const answers: WizardAnswers = {
    automationFramework: "playwright-ts",
    reportLanguage: "en",
    autonomyLevel: "medium",
    qaConventions: "x",
    atlassianMcp: false,
    playwrightMcp: false,
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
      observability: [],
      performance: [],
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
      observability: [],
      performance: [],
      manifests: ["pom.xml"],
    };
    const jvmAnswers: WizardAnswers = { ...answers, automationFramework: "restassured" };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: jvmStack, answers: jvmAnswers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["jvm-results"]).toBeDefined();
  });

  it("wires Allure result/history dirs into the result server when observability is detected (R-012)", () => {
    const allureStack: DetectedStack = { ...stack, observability: ["allure"] };
    scaffold({ root: project.dir, adapter: claudeAdapter, stack: allureStack, answers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["playwright-results"].args).toEqual(
      expect.arrayContaining(["./allure-results", "./allure-report"]),
    );
  });

  it("renders the Playwright browser server on both platforms when opted in, omits it when off (R-023)", () => {
    // Off by default → absent from both envelopes.
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8")).mcpServers["playwright-browser"]).toBeUndefined();

    // Opted in → present in both, with the platform-correct envelope key.
    const optIn: WizardAnswers = { ...answers, playwrightMcp: true };
    const claudeProject = tempProject();
    const copilotProject = tempProject();
    try {
      scaffold({ root: claudeProject.dir, adapter: claudeAdapter, stack, answers: optIn });
      const claude = JSON.parse(readFileSync(join(claudeProject.dir, ".mcp.json"), "utf8"));
      expect(claude.mcpServers["playwright-browser"].args).toEqual(["-y", "@playwright/mcp@latest"]);

      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers: optIn });
      const copilot = JSON.parse(readFileSync(join(copilotProject.dir, ".vscode/mcp.json"), "utf8"));
      expect(copilot.servers["playwright-browser"].args).toEqual(["-y", "@playwright/mcp@latest"]);
    } finally {
      claudeProject.cleanup();
      copilotProject.cleanup();
    }
  });

  it("omits the Atlassian server when the wizard opt-in is off (R-009)", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const mcp = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers.atlassian).toBeUndefined();
  });

  it("wires the Atlassian server with platform-correct env syntax when opted in (R-009)", () => {
    const optIn: WizardAnswers = { ...answers, atlassianMcp: true };

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers: optIn });
    const claude = JSON.parse(readFileSync(join(project.dir, ".mcp.json"), "utf8"));
    expect(claude.mcpServers.atlassian.env.ATLASSIAN_URL).toBe("${ATLASSIAN_URL}");
    expect(claude.mcpServers.atlassian.args).toEqual(["${ATLASSIAN_MCP_PATH}"]);

    const copilotProject = tempProject();
    try {
      scaffold({ root: copilotProject.dir, adapter: copilotAdapter, stack, answers: optIn });
      const copilot = JSON.parse(readFileSync(join(copilotProject.dir, ".vscode/mcp.json"), "utf8"));
      // VS Code uses the ${env:VAR} form.
      expect(copilot.servers.atlassian.env.ATLASSIAN_URL).toBe("${env:ATLASSIAN_URL}");
      expect(copilot.servers.atlassian.args).toEqual(["${env:ATLASSIAN_MCP_PATH}"]);
    } finally {
      copilotProject.cleanup();
    }
  });
});
