import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  nextSkills,
  procedureSteps,
  renderOrchestrationGraph,
  renderSkillCatalog,
  renderSkillFlow,
  SKILLS,
  triggerLine,
} from "../src/index.js";

// Repo root: packages/core/tests → up three levels.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CATALOG_REL = "docs/skill-catalog.md";

describe("skill-flows generator (R-052)", () => {
  const valid = new Set(SKILLS.map((s) => s.name));

  it("covers every skill in the suite, grouped by bucket", () => {
    const md = renderSkillCatalog(SKILLS);
    for (const s of SKILLS) {
      expect(md, `catalog documents ${s.name}`).toContain(`#### \`${s.name}\``);
    }
    expect(md).toContain(`## Skills (${SKILLS.length})`);
  });

  it("wraps every Mermaid diagram in @formatter guards (R-054 — born compliant)", () => {
    const md = renderSkillCatalog(SKILLS);
    const fences = (md.match(/```mermaid/g) ?? []).length;
    const open = (md.match(/<!-- @formatter:off -->/g) ?? []).length;
    const close = (md.match(/<!-- @formatter:on -->/g) ?? []).length;
    expect(fences).toBeGreaterThanOrEqual(SKILLS.length + 3); // per-skill + the aggregate flows
    expect(open).toBe(fences); // every fence is guarded
    expect(close).toBe(fences); // every guard is closed
  });

  it("every ## Next edge resolves to a real skill (no dangling hand-offs)", () => {
    for (const s of SKILLS) {
      for (const n of nextSkills(s, valid)) {
        expect(valid.has(n), `${s.name} → ${n} is a real skill`).toBe(true);
      }
    }
    // The orchestration graph only ever references real skill node ids.
    const graph = renderOrchestrationGraph(SKILLS);
    const ids = new Set([...valid].map((n) => n.replace(/-/g, "_")));
    for (const m of graph.matchAll(/^\s{2}(qa_[a-z0-9_]+) -->/gm)) {
      expect(ids.has(m[1]!), `edge source ${m[1]} is a skill`).toBe(true);
    }
  });

  it("derives the trigger, procedure spine, and a flowchart per skill", () => {
    for (const s of SKILLS) {
      expect(triggerLine(s).length, `${s.name} has a trigger`).toBeGreaterThan(0);
      expect(procedureSteps(s).length, `${s.name} has procedure steps`).toBeGreaterThan(0);
      const flow = renderSkillFlow(s, valid);
      expect(flow).toContain("flowchart TD");
      expect(flow).toContain(`${s.name.replace(/-/g, "_")}[`);
    }
  });

  // Drift guard + regenerator. Run `WRITE_DOCS=1 vitest run skill-flows` to
  // (re)generate the committed catalog; the normal run asserts it is in sync, so
  // a skills.ts change without a docs regeneration fails CI (docs-as-code).
  it("docs/skill-catalog.md is in sync with the generator", () => {
    const expected = renderSkillCatalog(SKILLS);
    const abs = join(REPO_ROOT, CATALOG_REL);
    if (process.env.WRITE_DOCS === "1") {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, expected, "utf8");
    }
    expect(existsSync(abs), `${CATALOG_REL} exists (run WRITE_DOCS=1 to generate)`).toBe(true);
    expect(readFileSync(abs, "utf8"), `${CATALOG_REL} is stale — regenerate with \`npm run docs\``).toBe(expected);
  });
});
