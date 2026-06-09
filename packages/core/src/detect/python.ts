import type { AutomationFramework, BuildTool } from "../types.js";
import { readIfExists } from "../util/fs.js";
import type { DetectorResult } from "./node.js";

/**
 * Detect a Python test project from pyproject.toml / requirements.txt / setup.py.
 * MVP parsing is substring-based over the manifest text (no TOML parser). pytest
 * is a first-class scaffolded stack (wizard default, QA advice, MCP results).
 */
export function detectPython(root: string): DetectorResult {
  const pyproject = readIfExists(root, "pyproject.toml");
  const requirements = readIfExists(root, "requirements.txt");
  const setupPy = readIfExists(root, "setup.py");

  if (pyproject === null && requirements === null && setupPy === null) {
    return { matched: false, buildTool: "unknown", frameworks: [], linters: [], manifests: [] };
  }

  const manifests: string[] = [];
  if (pyproject !== null) manifests.push("pyproject.toml");
  if (requirements !== null) manifests.push("requirements.txt");
  if (setupPy !== null) manifests.push("setup.py");

  const buildTool: BuildTool =
    pyproject !== null && pyproject.toLowerCase().includes("[tool.poetry]") ? "poetry" : "pip";

  const text = `${pyproject ?? ""}\n${requirements ?? ""}\n${setupPy ?? ""}`.toLowerCase();
  const frameworks: AutomationFramework[] = [];
  if (text.includes("pytest")) frameworks.push("pytest");

  const linters: string[] = [];
  for (const tool of ["ruff", "flake8", "black", "isort", "mypy"]) {
    if (text.includes(tool)) linters.push(tool);
  }

  return { matched: true, buildTool, frameworks, linters, manifests };
}
