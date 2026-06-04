import type { BuildTool, TestFramework } from "../types.js";
import { exists, readIfExists } from "../util/fs.js";

export interface NodeDetection {
  matched: boolean;
  buildTool: BuildTool;
  testFramework: TestFramework;
  linters: string[];
  manifests: string[];
}

/**
 * Detect a Node/JS/TS project from package.json. Parsing is intentionally light
 * for MVP: package.json is real JSON, so JSON.parse is exact; everything else is
 * presence checks. Swap in richer parsing later if needed.
 */
export function detectNode(root: string): NodeDetection {
  const pkgRaw = readIfExists(root, "package.json");
  if (pkgRaw === null) {
    return { matched: false, buildTool: "unknown", testFramework: "unknown", linters: [], manifests: [] };
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
    // Malformed package.json: still counts as a Node project, just no dep signal.
  }

  const buildTool: BuildTool = exists(root, "pnpm-lock.yaml")
    ? "pnpm"
    : exists(root, "yarn.lock")
      ? "yarn"
      : "npm";

  const testFramework: TestFramework = "vitest" in deps ? "vitest" : "jest" in deps ? "jest" : "unknown";

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

  return { matched: true, buildTool, testFramework, linters, manifests };
}
