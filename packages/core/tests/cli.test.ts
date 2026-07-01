import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeAdapter, copilotAdapter, runCli } from "../src/index.js";
import type { CliMeta } from "../src/index.js";
import { tempProject } from "./helpers.js";

// Exercises the shared `runCli` routing that the per-module tests never touch:
// command dispatch, flag parsing, and the process exit codes both leaf bins
// forward. `runCli` reads `process.argv` (via `parseArgs`), so each case sets it
// and restores it afterward. stdout/stderr are captured so we can assert on the
// help/unknown-command output without polluting the test log.

const meta: CliMeta = { binName: "test-qa", toolName: "Test Tool", version: "9.9.9" };

/** A minimal Playwright-TS project so `init --yes` produces a deterministic, doctor-clean scaffold. */
function seedPlaywrightProject(dir: string): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "app", devDependencies: { "@playwright/test": "^1.44.0" } }, null, 2),
  );
}

describe("runCli routing (R-080)", () => {
  const origArgv = process.argv;
  let out = "";
  let err = "";
  let project: ReturnType<typeof tempProject>;

  beforeEach(() => {
    project = tempProject();
    out = "";
    err = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      err += String(chunk);
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = origArgv;
    project.cleanup();
  });

  const run = async (adapter: typeof claudeAdapter, ...args: string[]): Promise<number> => {
    process.argv = ["node", "cli", ...args];
    return runCli(adapter, meta);
  };

  it("--help and the help command print usage and exit 0", async () => {
    expect(await run(claudeAdapter, "--help")).toBe(0);
    expect(out).toContain("test-qa");
    expect(out).toContain("Usage:");
    out = "";
    expect(await run(claudeAdapter, "help")).toBe(0);
    expect(out).toContain("Commands:");
  });

  it("an unknown command exits 1 and prints to stderr", async () => {
    expect(await run(claudeAdapter, "frobnicate")).toBe(1);
    expect(err).toContain("Unknown command: frobnicate");
  });

  it("init --yes scaffolds a doctor-clean repo, then doctor exits 0 and prints the footprint", async () => {
    seedPlaywrightProject(project.dir);
    expect(await run(claudeAdapter, "init", "--root", project.dir, "--yes")).toBe(0);
    expect(existsSync(join(project.dir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(project.dir, "context/.scaffold/manifest.json"))).toBe(true);

    out = "";
    expect(await run(claudeAdapter, "doctor", "--root", project.dir)).toBe(0);
    expect(out).toContain("Token footprint"); // R-081 footprint always shown
  });

  it("doctor exits 1 on an unscaffolded directory (structure errors)", async () => {
    expect(await run(claudeAdapter, "doctor", "--root", project.dir)).toBe(1);
  });

  it("doctor detects a platform mismatch and exits 1", async () => {
    seedPlaywrightProject(project.dir);
    await run(claudeAdapter, "init", "--root", project.dir, "--yes");
    // Scaffolded for Claude; run the Copilot doctor → MANIFEST:platform error → exit 1.
    expect(await run(copilotAdapter, "doctor", "--root", project.dir)).toBe(1);
  });

  it("update on a freshly-scaffolded repo reports up to date and exits 0", async () => {
    seedPlaywrightProject(project.dir);
    await run(claudeAdapter, "init", "--root", project.dir, "--yes");
    out = "";
    expect(await run(claudeAdapter, "update", "--root", project.dir)).toBe(0);
    expect(out).toContain("Already up to date");
  });

  it("doctor --fix on a clean scaffold finds no broken links and exits 0", async () => {
    seedPlaywrightProject(project.dir);
    await run(claudeAdapter, "init", "--root", project.dir, "--yes");
    out = "";
    expect(await run(claudeAdapter, "doctor", "--fix", "--root", project.dir)).toBe(0);
    expect(out).toContain("No broken relative links");
  });

  it("doctor --fix --write repairs a relocated-file link (dry-run stays non-destructive)", async () => {
    seedPlaywrightProject(project.dir);
    await run(claudeAdapter, "init", "--root", project.dir, "--yes");
    // Reference a foundation doc by a wrong relative path; the basename resolves
    // uniquely, so fixLinks can repair it deterministically.
    appendFileSync(
      join(project.dir, ".ai/guidelines/qa-conventions.md"),
      "\nSee [tools](./tools.md).\n", // real file lives at context/foundation/tools.md
    );
    // Dry-run: proposes the fix, exits 0, writes nothing.
    out = "";
    expect(await run(claudeAdapter, "doctor", "--fix", "--root", project.dir)).toBe(0);
    expect(out).toContain("would fix");
    // Write: applies it; a follow-up doctor has no LINK error.
    expect(await run(claudeAdapter, "doctor", "--fix", "--write", "--root", project.dir)).toBe(0);
  });

  it("runs the Copilot leaf's init + doctor with identical exit codes (parity)", async () => {
    seedPlaywrightProject(project.dir);
    expect(await run(copilotAdapter, "init", "--root", project.dir, "--yes")).toBe(0);
    expect(existsSync(join(project.dir, ".github/copilot-instructions.md"))).toBe(true);
    expect(await run(copilotAdapter, "doctor", "--root", project.dir)).toBe(0);
  });
});
