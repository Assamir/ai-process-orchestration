import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderCostDashboard } from "../src/index.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DASHBOARD_REL = "docs/cost-dashboard.html";

describe("cost-dashboard generator (R-104)", () => {
  it("is a self-contained HTML document with no external assets", () => {
    const html = renderCostDashboard();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>AI cost");
    // No external network references — fully self-contained (CSP-safe).
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\/[^"' )]+\.(js|css|png|jpg|svg|woff2?)/i);
  });

  it("reads the sibling index.json and tags real vs estimate", () => {
    const html = renderCostDashboard();
    expect(html).toContain('fetch("./index.json"');
    expect(html).toContain("real");
    expect(html).toContain("estimate");
    expect(html).toContain("<svg"); // hand-rolled SVG donut
    expect(html).toContain("@keyframes"); // CSS animation
  });

  it("carries no unresolved phase-1/phase-2 placeholder markers", () => {
    expect(renderCostDashboard()).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
  });

  it("is deterministic (no dates / randomness baked in)", () => {
    expect(renderCostDashboard()).toBe(renderCostDashboard());
  });

  // Drift guard + regenerator (docs-as-code). `WRITE_DOCS=1 vitest run cost-dashboard`
  // regenerates the committed file; the normal run asserts it is in sync.
  it("docs/cost-dashboard.html is in sync with the generator", () => {
    const expected = renderCostDashboard();
    const abs = join(REPO_ROOT, DASHBOARD_REL);
    if (process.env.WRITE_DOCS === "1") {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, expected, "utf8");
    }
    expect(existsSync(abs), `${DASHBOARD_REL} exists (run WRITE_DOCS=1 to generate)`).toBe(true);
    expect(readFileSync(abs, "utf8"), `${DASHBOARD_REL} is stale — regenerate with \`npm run docs\``).toBe(expected);
  });
});
