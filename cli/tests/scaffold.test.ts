import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSkill } from "../src/install-skill/index.js";
import { scaffold } from "../src/scaffold/index.js";
import type { DetectedStack, WizardAnswers } from "../src/types.js";
import { tempProject } from "./helpers.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  testFramework: "vitest",
  linters: ["eslint", "prettier"],
  manifests: ["package.json"],
};

const answers: WizardAnswers = {
  testFramework: "vitest",
  codingStandards: "Be explicit.",
  namingConventions: "kebab-case files.",
};

describe("scaffold + installSkill", () => {
  let project: ReturnType<typeof tempProject>;

  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("creates the /.ai structure, manifest, and skill on first run", () => {
    const results = scaffold({ root: project.dir, stack, answers, skillName: "agent-config" });
    const skill = installSkill({ root: project.dir, skillName: "agent-config", stack, answers });

    for (const r of results) expect(r.status).toBe("created");
    expect(skill.status).toBe("created");

    expect(existsSync(join(project.dir, ".ai/AGENTS.md"))).toBe(true);
    expect(existsSync(join(project.dir, ".ai/guidelines/coding-standards.md"))).toBe(true);
    expect(existsSync(join(project.dir, ".ai/guidelines/naming-conventions.md"))).toBe(true);
    expect(existsSync(join(project.dir, ".ai/agents/example-agent.md"))).toBe(true);
    expect(existsSync(join(project.dir, ".claude/skills/agent-config/SKILL.md"))).toBe(true);
  });

  it("injects the chosen test framework into the iron QA rule", () => {
    scaffold({ root: project.dir, stack, answers, skillName: "agent-config" });
    const agents = readFileSync(join(project.dir, ".ai/AGENTS.md"), "utf8");
    expect(agents).toContain("Vitest");
    expect(agents).not.toContain("{{TEST_FRAMEWORK}}");
  });

  it("writes a valid manifest with the choices", () => {
    scaffold({ root: project.dir, stack, answers, skillName: "agent-config" });
    const manifest = JSON.parse(readFileSync(join(project.dir, ".ai/.scaffold/manifest.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.stack.language).toBe("node");
    expect(manifest.choices.testFramework).toBe("vitest");
    expect(manifest.skillName).toBe("agent-config");
  });

  it("is idempotent: a second run skips everything", () => {
    scaffold({ root: project.dir, stack, answers, skillName: "agent-config" });
    installSkill({ root: project.dir, skillName: "agent-config", stack, answers });

    const second = scaffold({ root: project.dir, stack, answers, skillName: "agent-config" });
    const secondSkill = installSkill({ root: project.dir, skillName: "agent-config", stack, answers });

    for (const r of second) expect(r.status).toBe("skipped");
    expect(secondSkill.status).toBe("skipped");
  });
});
