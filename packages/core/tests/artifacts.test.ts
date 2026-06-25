import { describe, expect, it } from "vitest";
import {
  ARTIFACTS,
  docTier,
  frontmatterKeys,
  frontmatterList,
  pathIsPillar,
  SKILLS,
  tpl,
} from "../src/index.js";

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
      "knowledge",
    ]);
    // Each artifact is work-item-scoped or in a standalone area (refinements / knowledge).
    for (const a of ARTIFACTS) {
      expect(a.pathTemplate, a.name).toMatch(
        /^context\/(changes\/<work-id>\/[a-z-]+|(refinements|knowledge)\/[A-Za-z<>-]+)\.md$/,
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

  it("classifies doc tiers from the path (R-069)", () => {
    expect(docTier("context/foundation/tools.md")).toBe("durable");
    expect(docTier("context/reference/system-overview.md")).toBe("durable");
    expect(docTier("context/knowledge/billing.md")).toBe("durable");
    expect(docTier("context/changes/api-login/plan.md")).toBe("runtime");
    expect(docTier(".ai/guidelines/grounding.md")).toBeNull();
    expect(docTier("context/changes/.gitkeep")).toBeNull();
  });

  it("parses frontmatter keys and list values (R-069/R-070)", () => {
    const text = "---\nstatus: in-progress\nwork-id: x\nbuilt-on:\n  - context/reference/system-overview.md   # P1\n  - context/knowledge/billing.md\n---\n# Body\n";
    expect([...frontmatterKeys(text)]).toEqual(["status", "work-id", "built-on"]);
    expect(frontmatterList(text, "built-on")).toEqual([
      "context/reference/system-overview.md",
      "context/knowledge/billing.md",
    ]);
    // No frontmatter → empty.
    expect([...frontmatterKeys("# No frontmatter")]).toEqual([]);
    expect(frontmatterList("# none", "built-on")).toEqual([]);
  });

  it("carries the per-skill required-pillar map + built-on provenance (R-070)", () => {
    const byName = new Map(ARTIFACTS.map((a) => [a.name, a]));
    expect(byName.get("plan")!.requiredPillars).toEqual(["P1", "P2"]);
    expect(byName.get("cases")!.requiredPillars).toEqual(["P1", "P2"]);
    expect(byName.get("automation")!.requiredPillars).toEqual(["P3"]);
    expect(byName.get("performance")!.requiredPillars).toEqual(["P1"]);
    // The templates carry a built-on: frontmatter the validator reads.
    for (const name of ["plan", "cases", "automation", "performance"]) {
      expect(byName.get(name)!.template, `${name} built-on`).toContain("built-on:");
    }
    // The pillar-path classifier maps a built-on path to its pillar.
    expect(pathIsPillar("context/reference/system-overview.md", "P1")).toBe(true);
    expect(pathIsPillar("context/knowledge/billing.md", "P2")).toBe(true);
    expect(pathIsPillar("context/refinements/2026-01-01-X-y.md", "P2")).toBe(true);
    expect(pathIsPillar("context/foundation/framework-architecture.md", "P3")).toBe(true);
    expect(pathIsPillar("context/reference/system-overview.md", "P3")).toBe(false);
  });
});
