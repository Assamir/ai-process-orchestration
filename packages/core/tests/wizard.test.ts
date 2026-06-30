import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @clack/prompts so we can drive the wizard non-interactively. Each prompt
// returns the next queued answer; `multiselect` is what R-092 adds.
const answers: unknown[] = [];
vi.mock("@clack/prompts", () => ({
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: (v: unknown) => typeof v === "symbol",
  select: vi.fn(async () => answers.shift()),
  text: vi.fn(async () => answers.shift()),
  confirm: vi.fn(async () => answers.shift()),
  multiselect: vi.fn(async () => answers.shift()),
}));

import { runWizard } from "../src/index.js";
import type { DetectedStack } from "../src/index.js";

const stack: DetectedStack = {
  language: "node",
  buildTool: "npm",
  frameworks: ["playwright-ts"],
  primaryFramework: "playwright-ts",
  linters: ["eslint"],
  observability: [],
  performance: [],
  manifests: ["package.json"],
};

/** Queue the non-guideline prompt answers in ask order, then the multiselect. */
function queue(opts: {
  atlassianMcp?: boolean;
  xrayMcp?: boolean;
  markitdownMcp?: boolean;
  guidelines: string[];
}): void {
  answers.length = 0;
  answers.push(
    "playwright-ts", // automationFramework (select)
    "en", // reportLanguage (select)
    "medium", // autonomyLevel (select)
    "Independent, deterministic tests.", // qaConventions (text)
    opts.atlassianMcp ?? false, // atlassianMcp (confirm)
    false, // playwrightMcp (confirm)
    opts.xrayMcp ?? false, // xrayMcp (confirm)
    opts.markitdownMcp ?? false, // markitdownMcp (confirm)
    opts.guidelines, // guideline multiselect (R-092)
  );
}

describe("wizard guideline override (R-092)", () => {
  beforeEach(() => {
    answers.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records the user's guideline selection in canonical order", async () => {
    // User keeps two universal guidelines + opts security-testing in (out of order).
    queue({ guidelines: ["test-naming", "qa-conventions"] });
    const res = await runWizard(stack);
    expect(res).not.toBeNull();
    // Canonical GUIDELINES order, independent of selection order.
    expect(res!.guidelines).toEqual(["qa-conventions", "test-naming"]);
  });

  it("can add a conditional guideline the stack wouldn't auto-select", async () => {
    // No JMeter in the stack, but the user opts performance-testing in.
    queue({ guidelines: ["qa-conventions", "performance-testing"] });
    const res = await runWizard(stack);
    expect(res!.guidelines).toContain("performance-testing");
  });

  it("returns null when the user cancels the multiselect", async () => {
    queue({ guidelines: [] });
    answers[answers.length - 1] = Symbol("cancel"); // cancel the guideline step
    const res = await runWizard(stack);
    expect(res).toBeNull();
  });
});
