import { describe, expect, it } from "vitest";
import { ARTIFACTS, SKILLS, tpl } from "../src/index.js";

describe("artifact template registry (R-059)", () => {
  const byName = new Map(SKILLS.map((s) => [s.name, s]));

  it("is the single source of shape for the runtime artifacts", () => {
    expect(ARTIFACTS.map((a) => a.name)).toEqual([
      "work",
      "plan",
      "cases",
      "automation",
      "performance",
      "bug-report",
      "refinement",
    ]);
    // Each artifact is either work-item-scoped or in a standalone area (refinements).
    for (const a of ARTIFACTS) {
      expect(a.pathTemplate, a.name).toMatch(
        /^context\/(changes\/<work-id>\/[a-z-]+|refinements\/[A-Za-z<>-]+)\.md$/,
      );
    }
  });

  it("every producedBy is a real skill that declares the artifact in its writes", () => {
    for (const a of ARTIFACTS) {
      const skill = byName.get(a.producedBy);
      expect(skill, `${a.name}: producedBy '${a.producedBy}' exists`).toBeDefined();
      expect(skill!.writes, `${a.name}: pathTemplate in ${a.producedBy}.writes`).toContain(a.pathTemplate);
    }
  });

  it("every template literally contains its required ## sections", () => {
    for (const a of ARTIFACTS) {
      for (const h of a.requiredSections) {
        expect(a.template, `${a.name}: ## ${h}`).toContain(`## ${h}`);
      }
    }
  });

  it("carries the parseable trace markers R-061 will validate", () => {
    const work = ARTIFACTS.find((a) => a.name === "work")!;
    expect(work.template).toContain("status: in-progress");
    expect(work.template).toMatch(/\*\*AC1\*\*/);

    const cases = ARTIFACTS.find((a) => a.name === "cases")!;
    expect(cases.traceField).toBe("Traces to");
    expect(cases.template).toContain("Traces to:");
    expect(cases.template).toMatch(/\bTC1\b/);

    const automation = ARTIFACTS.find((a) => a.name === "automation")!;
    expect(automation.traceField).toBe("Covers");
    expect(automation.template).toContain("Covers: TC1");

    const performance = ARTIFACTS.find((a) => a.name === "performance")!;
    expect(performance.traceField).toBe("Traces to");
    expect(performance.template).toContain("Traces to:");
  });

  it("each producing skill embeds its canonical template in a fenced ## Template section", () => {
    for (const a of ARTIFACTS) {
      const skill = byName.get(a.producedBy)!;
      expect(skill.body, `${a.producedBy} has a ## Template section`).toContain("## Template");
      expect(skill.body, `${a.producedBy} embeds the registry template`).toContain(a.template);
    }
  });

  it("tpl() returns the template and throws on an unknown name", () => {
    expect(tpl("cases")).toBe(ARTIFACTS.find((a) => a.name === "cases")!.template);
    expect(() => tpl("nope")).toThrow(/Unknown artifact template/);
  });
});
