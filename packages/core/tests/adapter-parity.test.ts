import { describe, expect, it } from "vitest";
import {
  ARTIFACTS,
  claudeAdapter,
  copilotAdapter,
  FOUNDATION,
  mcpServers,
  SKILLS,
} from "../src/index.js";
import type { LogicalSkill, McpContext, McpServer } from "../src/index.js";

// These tests pin the *cross-adapter* invariants that the per-platform snapshot
// tests in scaffold.test.ts do not: that the two adapters stay functionally paired
// (equal tool tiers, equal MCP server sets) and that skills never reference a
// context artifact that the model does not define. They render the adapters
// directly — no scaffold-to-disk needed — so a unilateral change to one adapter
// (a tool added to one side only, an MCP server wired asymmetrically) fails here
// instead of silently drifting.

// --- helpers ---------------------------------------------------------------

/** Parse the Claude `allowed-tools:` frontmatter line into a tool list. */
function claudeTools(skill: LogicalSkill): string[] {
  const content = claudeAdapter.renderSkill(skill)[0]!.content;
  const m = content.match(/^allowed-tools: (.+)$/m);
  expect(m, `claude allowed-tools line for ${skill.name}`).not.toBeNull();
  return m![1]!.split(",").map((t) => t.trim());
}

/** Parse the Copilot `tools: [...]` frontmatter line into a tool list. */
function copilotTools(skill: LogicalSkill): string[] {
  const content = copilotAdapter.renderSkill(skill)[0]!.content;
  const m = content.match(/^tools: \[(.+)\]$/m);
  expect(m, `copilot tools line for ${skill.name}`).not.toBeNull();
  return m![1]!.split(",").map((t) => t.trim().replace(/^'|'$/g, ""));
}

const readOnlySkill = SKILLS.find((s) => s.readOnly)!;
const writeSkill = SKILLS.find((s) => !s.readOnly)!;

// --- A. tool-allowlist alignment -------------------------------------------

describe("adapter parity — tool allowlists", () => {
  // Single source of truth for the two tiers on each platform. If either adapter
  // changes its READ_TOOLS/WRITE_TOOLS constants, these exact-match assertions
  // fail and force a conscious, reviewed parity decision.
  const CLAUDE_READ = ["Read", "Grep", "Glob"];
  const CLAUDE_WRITE = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"];
  const COPILOT_READ = ["codebase", "search"];
  const COPILOT_WRITE = ["codebase", "search", "editFiles", "runCommands"];

  it("pins the canonical read/write tool tiers on both platforms", () => {
    expect(claudeTools(readOnlySkill)).toEqual(CLAUDE_READ);
    expect(claudeTools(writeSkill)).toEqual(CLAUDE_WRITE);
    expect(copilotTools(readOnlySkill)).toEqual(COPILOT_READ);
    expect(copilotTools(writeSkill)).toEqual(COPILOT_WRITE);
  });

  it("keeps the write tier a strict superset of the read tier on both platforms", () => {
    // The write allowlist must be the read allowlist plus write-only additions —
    // never a divergent set that drops a read capability.
    expect(CLAUDE_WRITE.slice(0, CLAUDE_READ.length)).toEqual(CLAUDE_READ);
    expect(CLAUDE_WRITE.length).toBeGreaterThan(CLAUDE_READ.length);
    expect(COPILOT_WRITE.slice(0, COPILOT_READ.length)).toEqual(COPILOT_READ);
    expect(COPILOT_WRITE.length).toBeGreaterThan(COPILOT_READ.length);
  });

  it("classifies every skill into the same (read vs write) tier on both platforms", () => {
    // The pairing invariant: both adapters branch on the *same* shared
    // `skill.readOnly`, so a read-only skill gets the read tier on BOTH platforms
    // and a write skill the write tier on BOTH — they can never disagree on which
    // tier a given skill lands in.
    for (const skill of SKILLS) {
      const expectClaude = skill.readOnly ? CLAUDE_READ : CLAUDE_WRITE;
      const expectCopilot = skill.readOnly ? COPILOT_READ : COPILOT_WRITE;
      expect(claudeTools(skill), `claude tools for ${skill.name}`).toEqual(expectClaude);
      expect(copilotTools(skill), `copilot tools for ${skill.name}`).toEqual(expectCopilot);
    }
  });
});

// --- B. MCP server-set equivalence -----------------------------------------

describe("adapter parity — MCP configuration", () => {
  /** Rewrite the shared model's `${VAR}` tokens to VS Code's `${env:VAR}` form. */
  function toVscode<T>(value: T): T {
    return JSON.parse(JSON.stringify(value).replace(/\$\{([A-Z0-9_]+)\}/g, "${env:$1}")) as T;
  }

  function assertEquivalent(ctx: McpContext): void {
    const claude = JSON.parse(claudeAdapter.mcpFile(ctx).content) as {
      mcpServers: Record<string, McpServer>;
    };
    const copilot = JSON.parse(copilotAdapter.mcpFile(ctx).content) as {
      servers: Record<string, McpServer>;
    };

    // Same server set, only the JSON envelope key differs.
    expect(Object.keys(copilot.servers).sort()).toEqual(Object.keys(claude.mcpServers).sort());
    // And the shared model is exactly what each adapter wrapped.
    expect(Object.keys(claude.mcpServers).sort()).toEqual(Object.keys(mcpServers(ctx)).sort());

    // The two payloads are identical modulo the interpolation syntax: Copilot
    // globally rewrites `${VAR}` → `${env:VAR}` (across command, args, and env),
    // Claude keeps `${VAR}`. Applying the same rewrite to Claude's payload must
    // reproduce Copilot's exactly — no server, arg, or env may differ otherwise.
    expect(copilot.servers).toEqual(toVscode(claude.mcpServers));
  }

  it("wires the same server set on both platforms (minimal stack)", () => {
    assertEquivalent({ framework: "playwright-ts", buildTool: "npm" });
  });

  it("wires the same server set on both platforms (all optional servers on)", () => {
    assertEquivalent({
      framework: "playwright-ts",
      buildTool: "npm",
      atlassianMcp: true,
      playwrightMcp: true,
      xrayMcp: true,
      markitdownMcp: true,
      observability: ["allure"],
      performance: ["jmeter"],
    });
  });

  it("wires the same server set on both platforms (JVM stack)", () => {
    assertEquivalent({ framework: "restassured", buildTool: "maven", atlassianMcp: true });
  });
});

// --- C. skill ↔ context artifact reference integrity -----------------------

describe("adapter parity — skill context references", () => {
  const foundationPaths = new Set(FOUNDATION.map((f) => f.rel));
  const artifactPaths = new Set(ARTIFACTS.map((a) => a.pathTemplate));

  // Known runtime patterns a skill may legitimately read/write that are NOT a
  // FOUNDATION file or an ARTIFACT template: the phase-1 manifest, `.jira`
  // dual-output siblings of a `.md` artifact, attachment dirs, and bare
  // directories (trailing `/`, incl. `<placeholder>` dirs).
  function isKnownRuntimePath(p: string): boolean {
    if (p === "context/.scaffold/manifest.json") return true;
    if (p.endsWith("/")) return true; // a directory, not a concrete artifact
    if (p.endsWith(".jira")) {
      // dual-output sibling: the `.md` form must be a real artifact template.
      return artifactPaths.has(p.replace(/\.jira$/, ".md"));
    }
    return false;
  }

  it("only reads/writes context paths that the model defines", () => {
    for (const skill of SKILLS) {
      for (const p of [...skill.reads, ...skill.writes]) {
        if (!p.startsWith("context/")) continue; // prose (e.g. guideline files) — skip
        const where = `${skill.name}: ${p}`;
        if (p.startsWith("context/foundation/") || p.startsWith("context/reference/")) {
          // concrete durable docs must exist in FOUNDATION (unless a bare dir).
          if (p.endsWith("/")) continue;
          expect(foundationPaths.has(p), `${where} not in FOUNDATION`).toBe(true);
        } else if (artifactPaths.has(p)) {
          continue; // a declared artifact template
        } else {
          expect(isKnownRuntimePath(p), `${where} is not a known context artifact`).toBe(true);
        }
      }
    }
  });

  it("keeps every artifact template wired to its producing skill (R-059)", () => {
    // Forward direction, cross-checked here so a renamed artifact path or a
    // dropped `writes` entry is caught alongside the reference-integrity check.
    for (const art of ARTIFACTS) {
      const producer = SKILLS.find((s) => s.name === art.producedBy);
      expect(producer, `producer ${art.producedBy} for ${art.name}`).toBeDefined();
      const wired = producer!.writes.some(
        (w) => w === art.pathTemplate || w === art.pathTemplate.replace(/[^/]+$/, ""),
      );
      expect(wired, `${art.producedBy}.writes wires ${art.pathTemplate}`).toBe(true);
    }
  });
});
