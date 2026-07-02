import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregateRecords,
  anonymizeEmail,
  claudeAdapter,
  copilotAdapter,
  costUsd,
  emailSlug,
  PRICING,
  priceFor,
  recordUser,
  runDoctor,
  scaffold,
  seedIndex,
  TELEMETRY_INDEX_REL,
  telemetryFiles,
  userLogRel,
  type DetectedStack,
  type TelemetryRecord,
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

function rec(over: Partial<TelemetryRecord> = {}): TelemetryRecord {
  return {
    ts: "2026-07-01T00:00:00.000Z",
    user: "a@corp.com",
    platform: "claude",
    skill: "qa-plan",
    description: "plan the login work",
    model: "claude-opus-4-8",
    tokens: { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0 },
    costUsd: 0,
    source: "estimate",
    ...over,
  };
}

describe("telemetry pricing (R-101/R-102)", () => {
  it("matches a model id by longest key prefix, else default", () => {
    expect(priceFor("claude-opus-4-8-2026")).toBe(PRICING["claude-opus-4"]);
    expect(priceFor("gpt-4o-mini")).toBe(PRICING["gpt-4o"]);
    expect(priceFor("totally-unknown-model")).toBe(PRICING.default);
  });

  it("prices a token split in USD per million", () => {
    // opus: 1M input @ $15 + 1M output @ $75 = $90
    expect(costUsd("claude-opus-4-8", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheCreation: 0 })).toBe(90);
    expect(costUsd("claude-opus-4-8", { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })).toBe(0);
  });
});

describe("telemetry identity (R-100)", () => {
  it("slugifies an email into a filesystem-safe basename", () => {
    expect(emailSlug("A.B@Corp.com")).toBe("a-b-corp-com");
    expect(emailSlug("")).toBe("unknown");
  });

  it("anonymizes deterministically and irreversibly", () => {
    const a = anonymizeEmail("a@corp.com");
    expect(a).toMatch(/^anon-[0-9a-f]{12}$/);
    expect(anonymizeEmail("a@corp.com")).toBe(a); // stable
    expect(a).not.toContain("corp");
  });

  it("picks the log filename by anonymization choice", () => {
    expect(userLogRel("a@corp.com", false)).toBe("context/telemetry/a-corp-com.jsonl");
    expect(userLogRel("a@corp.com", true)).toMatch(/^context\/telemetry\/anon-[0-9a-f]{12}\.jsonl$/);
    expect(recordUser("a@corp.com", false)).toBe("a@corp.com");
    expect(recordUser("a@corp.com", true)).toMatch(/^anon-/);
  });
});

describe("telemetry aggregation (R-104)", () => {
  it("seeds an empty, deterministic aggregate", () => {
    const idx = seedIndex();
    expect(idx.schemaVersion).toBe(1);
    expect(idx.totals).toEqual({ records: 0, costUsd: 0, tokens: 0, real: 0, estimate: 0 });
    expect(idx.bySkill).toEqual([]);
    expect(JSON.stringify(seedIndex())).toBe(JSON.stringify(seedIndex())); // deterministic
  });

  it("rolls records up by skill/user/platform/work-item with the real-vs-estimate split", () => {
    const records = [
      rec({ skill: "qa-plan", costUsd: 1, source: "estimate", workId: "context/changes/login" }),
      rec({ skill: "qa-plan", costUsd: 2, source: "real", user: "b@corp.com", platform: "claude", workId: "context/changes/login" }),
      rec({ skill: "qa-rca", costUsd: 4, source: "estimate", platform: "copilot" }),
    ];
    const idx = aggregateRecords(records);
    expect(idx.totals.records).toBe(3);
    expect(idx.totals.costUsd).toBe(7);
    expect(idx.totals.real).toBe(1);
    expect(idx.totals.estimate).toBe(2);
    // Sorted by cost desc: qa-rca (4) before qa-plan (3).
    expect(idx.bySkill.map((g) => g.key)).toEqual(["qa-rca", "qa-plan"]);
    expect(idx.bySkill.find((g) => g.key === "qa-plan")!.costUsd).toBe(3);
    // Only records with a workId land in the ROI dimension.
    expect(idx.byWorkId.map((g) => g.key)).toEqual(["context/changes/login"]);
    expect(idx.byWorkId[0]!.costUsd).toBe(3);
    expect(idx.byPlatform.map((g) => g.key).sort()).toEqual(["claude", "copilot"]);
  });

  it("keeps the most recent task description per skill group", () => {
    const idx = aggregateRecords([
      rec({ skill: "qa-plan", description: "first" }),
      rec({ skill: "qa-plan", description: "second" }),
    ]);
    expect(idx.bySkill[0]!.description).toBe("second");
  });
});

describe("telemetry area scaffolding + doctor (R-100)", () => {
  let project: ReturnType<typeof tempProject>;
  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("scaffolds the telemetry area identically on both platforms (parity)", () => {
    const files = telemetryFiles();
    expect(files.map((f) => f.rel)).toContain("context/telemetry/README.md");
    expect(files.map((f) => f.rel)).toContain(TELEMETRY_INDEX_REL);

    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    expect(existsSync(join(project.dir, "context/telemetry/README.md"))).toBe(true);
    const idx = JSON.parse(readFileSync(join(project.dir, TELEMETRY_INDEX_REL), "utf8"));
    expect(idx.schemaVersion).toBe(1);

    const b = tempProject();
    try {
      scaffold({ root: b.dir, adapter: copilotAdapter, stack, answers });
      const rel = "context/telemetry/README.md";
      expect(readFileSync(join(project.dir, rel), "utf8")).toBe(readFileSync(join(b.dir, rel), "utf8"));
    } finally {
      b.cleanup();
    }
  });

  it("doctor is clean on the seeded telemetry area", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.filter((f) => f.id.startsWith("TELEMETRY"))).toEqual([]);
  });

  it("doctor flags a malformed telemetry aggregate", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers });
    writeFileSync(join(project.dir, TELEMETRY_INDEX_REL), "{ not json", "utf8");
    const report = runDoctor(project.dir, claudeAdapter);
    expect(report.findings.some((f) => f.id === "TELEMETRY:index" && f.severity === "error")).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("records the anonymization choice in the manifest", () => {
    scaffold({ root: project.dir, adapter: claudeAdapter, stack, answers: { ...answers, anonymizeTelemetry: true } });
    const manifest = JSON.parse(readFileSync(join(project.dir, "context/.scaffold/manifest.json"), "utf8"));
    expect(manifest.choices.anonymizeTelemetry).toBe(true);
  });
});
