import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { CAPTURE_SCRIPT } from "../src/index.js";

/**
 * The capture script (R-101) ships into target repos as a standalone zero-dep
 * `.mjs`, so we verify the *emitted* source: write it to a temp file and import
 * it, then exercise its pure exports. This also proves the string is valid,
 * importable ESM (no `${}` leakage, no syntax error).
 */
let mod: any;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qa-capture-"));
  const file = join(dir, "capture.mjs");
  writeFileSync(file, CAPTURE_SCRIPT, "utf8");
  mod = await import(pathToFileURL(file).href);
});

describe("capture script — pricing & estimator", () => {
  it("prices and estimates without a tiktoken dependency", () => {
    expect(mod.costUsd("claude-opus-4-8", { input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 })).toBe(15);
    expect(mod.estimateTokens("")).toBe(0);
    expect(mod.estimateTokens("abcd".repeat(4))).toBe(4); // 16 chars / 4
  });

  it("mirrors the core pricing table keys", () => {
    expect(Object.keys(mod.PRICING)).toContain("claude-opus-4");
    expect(Object.keys(mod.PRICING)).toContain("gpt-4o");
  });
});

describe("capture script — Claude transcript parsing (R-101/R-102)", () => {
  const session = [
    JSON.stringify({ type: "user", message: { role: "user", content: "/qa-plan test the login flow for context/changes/api-login" } }),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        content: [
          { type: "thinking", thinking: "reasoning here" },
          { type: "tool_use", name: "Skill", input: { skill: "qa-plan" } },
          { type: "text", text: "Here is the plan." },
        ],
        usage: { input_tokens: 3000, output_tokens: 200, cache_read_input_tokens: 15000, cache_creation_input_tokens: 8000 },
      },
    }),
  ].join("\n");

  it("prefers real usage when real=true (R-102)", () => {
    const r = mod.claudeSessionRecord(session, { real: true });
    expect(r.source).toBe("real");
    expect(r.model).toBe("claude-opus-4-8");
    expect(r.skill).toBe("qa-plan");
    expect(r.tokens).toEqual({ input: 3000, output: 200, cacheRead: 15000, cacheCreation: 8000 });
    expect(r.workId).toBe("context/changes/api-login");
    expect(r.description).toContain("test the login flow");
  });

  it("estimates from text when real=false (R-101)", () => {
    const r = mod.claudeSessionRecord(session, { real: false });
    expect(r.source).toBe("estimate");
    expect(r.tokens.output).toBeGreaterThan(0); // estimated from text/thinking, not usage
    expect(r.tokens.input).not.toBe(3000);
  });

  it("returns null for a session with no assistant turn", () => {
    expect(mod.claudeSessionRecord(JSON.stringify({ type: "user", message: { content: "hi" } }), { real: true })).toBeNull();
  });
});

describe("capture script — Copilot chat parsing (best-effort, estimate-only)", () => {
  it("estimates from requests and stays source=estimate", () => {
    const r = mod.copilotSessionRecord({
      requests: [
        { message: { text: "/qa-rca why is checkout flaky" }, response: [{ value: "Because of a race condition." }], modelId: "gpt-4o" },
      ],
    });
    expect(r.source).toBe("estimate");
    expect(r.skill).toBe("qa-rca");
    expect(r.model).toBe("gpt-4o");
    expect(r.tokens.input).toBeGreaterThan(0);
    expect(r.tokens.output).toBeGreaterThan(0);
  });

  it("returns null for an unrecognizable shape", () => {
    expect(mod.copilotSessionRecord({})).toBeNull();
    expect(mod.copilotSessionRecord(null)).toBeNull();
  });
});

describe("capture script — log merge & aggregation", () => {
  it("keeps one line per session id and preserves the first-seen ts", () => {
    const existing = [JSON.stringify({ sid: "claude:s1", ts: "2026-01-01T00:00:00.000Z", user: "u", platform: "claude", skill: "qa-plan", tokens: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, costUsd: 0.1, source: "estimate" })];
    const fresh = [
      { sid: "claude:s1", platform: "claude", skill: "qa-plan", description: "d", model: "claude-opus-4-8", tokens: { input: 10, output: 10, cacheRead: 0, cacheCreation: 0 }, source: "real" },
      { sid: "claude:s2", platform: "claude", skill: "qa-rca", description: "d2", model: "claude-opus-4-8", tokens: { input: 5, output: 5, cacheRead: 0, cacheCreation: 0 }, source: "real" },
    ];
    const merged = mod.mergeLogs(existing, fresh, "u", false);
    expect(merged).toHaveLength(2);
    const s1 = merged.find((m: any) => m.sid === "claude:s1");
    expect(s1.ts).toBe("2026-01-01T00:00:00.000Z"); // preserved
    expect(s1.source).toBe("real"); // updated
    expect(s1.costUsd).toBeGreaterThan(0); // recomputed from tokens
  });

  it("aggregates by skill/platform/workId deterministically", () => {
    const idx = mod.aggregateRecords([
      { skill: "qa-plan", platform: "claude", costUsd: 2, tokens: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, source: "real", workId: "context/changes/x" },
      { skill: "qa-rca", platform: "copilot", costUsd: 5, tokens: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 }, source: "estimate" },
    ]);
    expect(idx.schemaVersion).toBe(1);
    expect(idx.bySkill[0].key).toBe("qa-rca"); // higher cost first
    expect(idx.totals.real).toBe(1);
    expect(idx.totals.estimate).toBe(1);
    expect(idx.byWorkId.map((g: any) => g.key)).toEqual(["context/changes/x"]);
  });
});
