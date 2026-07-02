import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_TASK_LABEL,
  claudeAdapter,
  copilotAdapter,
  runDoctor,
  scaffold,
  VSCODE_TASKS_REL,
  type DetectedStack,
  type WizardAnswers,
} from "../src/index.js";
import { tempProject } from "./helpers.js";

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
  qaConventions: "Follow the guidelines.",
  atlassianMcp: false,
  playwrightMcp: false,
};

describe("VS Code auto-trigger (R-103)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("emits a folderOpen capture task and doctor is clean", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const tasks = JSON.parse(readFileSync(join(project.dir, VSCODE_TASKS_REL), "utf8"));
    const task = tasks.tasks.find((t: any) => t.label === CAPTURE_TASK_LABEL);
    expect(task).toBeTruthy();
    expect(task.runOptions.runOn).toBe("folderOpen");
    expect(task.args).toEqual(["context/telemetry/capture.mjs"]);
    expect(task.isBackground).toBe(true);

    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "TELEMETRY:trigger")).toBe(false);
  });

  it("is emitted identically for both platforms (parity-safe, not in an adapter)", () => {
    const b = tempProject();
    try {
      scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
      scaffold({ root: b.dir, adapter: copilotAdapter, stack, answers });
      expect(readFileSync(join(project.dir, VSCODE_TASKS_REL), "utf8")).toBe(
        readFileSync(join(b.dir, VSCODE_TASKS_REL), "utf8"),
      );
    } finally {
      b.cleanup();
    }
  });

  it("merges into an existing tasks.json without clobbering the user's tasks", () => {
    mkdirSync(join(project.dir, ".vscode"), { recursive: true });
    writeFileSync(
      join(project.dir, VSCODE_TASKS_REL),
      JSON.stringify({ version: "2.0.0", tasks: [{ label: "build", type: "shell", command: "npm run build" }] }, null, 2),
      "utf8",
    );
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const tasks = JSON.parse(readFileSync(join(project.dir, VSCODE_TASKS_REL), "utf8"));
    const labels = tasks.tasks.map((t: any) => t.label);
    expect(labels).toContain("build"); // preserved
    expect(labels).toContain(CAPTURE_TASK_LABEL); // added
  });

  it("is idempotent: a second scaffold does not duplicate the task", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const tasks = JSON.parse(readFileSync(join(project.dir, VSCODE_TASKS_REL), "utf8"));
    const captures = tasks.tasks.filter((t: any) => t.label === CAPTURE_TASK_LABEL);
    expect(captures).toHaveLength(1);
  });

  it("leaves an unparseable (JSONC) tasks.json untouched and doctor warns", () => {
    mkdirSync(join(project.dir, ".vscode"), { recursive: true });
    const jsonc = "{\n  // a comment\n  \"version\": \"2.0.0\", \"tasks\": []\n}\n";
    writeFileSync(join(project.dir, VSCODE_TASKS_REL), jsonc, "utf8");
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(readFileSync(join(project.dir, VSCODE_TASKS_REL), "utf8")).toBe(jsonc); // untouched
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "TELEMETRY:trigger" && f.severity === "warn")).toBe(true);
  });
});
