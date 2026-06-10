import type { AutomationFramework, BuildTool } from "../types.js";
import { exists, readIfExists } from "../util/fs.js";

export interface DetectorResult {
  matched: boolean;
  buildTool: BuildTool;
  frameworks: AutomationFramework[];
  linters: string[];
  /** Cross-run observability/reporting tools (e.g. `allure`). */
  observability: string[];
  manifests: string[];
}

/**
 * Detect a Node/JS/TS test project from package.json. Parsing is intentionally
 * light for MVP: package.json is real JSON, so JSON.parse is exact; everything
 * else is presence checks.
 */
export function detectNode(root: string): DetectorResult {
  const pkgRaw = readIfExists(root, "package.json");
  if (pkgRaw === null) {
    return { matched: false, buildTool: "unknown", frameworks: [], linters: [], observability: [], manifests: [] };
  }

  const manifests = ["package.json"];
  if (exists(root, "tsconfig.json")) manifests.push("tsconfig.json");

  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    // Malformed package.json: still a Node project, just no dependency signal.
  }

  const buildTool: BuildTool = exists(root, "pnpm-lock.yaml")
    ? "pnpm"
    : exists(root, "yarn.lock")
      ? "yarn"
      : "npm";

  const frameworks: AutomationFramework[] = [];
  const hasPlaywrightConfig =
    exists(root, "playwright.config.ts") ||
    exists(root, "playwright.config.js") ||
    exists(root, "playwright.config.mjs");
  if ("@playwright/test" in deps || hasPlaywrightConfig) frameworks.push("playwright-ts");

  const linters: string[] = [];
  if (
    "eslint" in deps ||
    exists(root, ".eslintrc") ||
    exists(root, ".eslintrc.json") ||
    exists(root, ".eslintrc.cjs") ||
    exists(root, "eslint.config.js") ||
    exists(root, "eslint.config.mjs")
  ) {
    linters.push("eslint");
  }
  if ("prettier" in deps || exists(root, ".prettierrc") || exists(root, ".prettierrc.json")) {
    linters.push("prettier");
  }
  if (exists(root, ".editorconfig")) linters.push("editorconfig");

  // Allure ships durable cross-run history/flakiness beyond the static report dir.
  const observability: string[] = [];
  if (Object.keys(deps).some((d) => d.includes("allure"))) observability.push("allure");

  return { matched: true, buildTool, frameworks, linters, observability, manifests };
}
