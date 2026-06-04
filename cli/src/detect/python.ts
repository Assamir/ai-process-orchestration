import type { BuildTool, TestFramework } from "../types.js";
import { readIfExists } from "../util/fs.js";

export interface PythonDetection {
  matched: boolean;
  buildTool: BuildTool;
  testFramework: TestFramework;
  linters: string[];
  manifests: string[];
}

/**
 * Detect a Python project from pyproject.toml / requirements.txt / setup.py.
 * MVP parsing is substring-based over the manifest text (no TOML parser) — enough
 * to spot pytest and common linters/formatters.
 */
export function detectPython(root: string): PythonDetection {
  const pyproject = readIfExists(root, "pyproject.toml");
  const requirements = readIfExists(root, "requirements.txt");
  const setupPy = readIfExists(root, "setup.py");

  if (pyproject === null && requirements === null && setupPy === null) {
    return { matched: false, buildTool: "unknown", testFramework: "unknown", linters: [], manifests: [] };
  }

  const manifests: string[] = [];
  if (pyproject !== null) manifests.push("pyproject.toml");
  if (requirements !== null) manifests.push("requirements.txt");
  if (setupPy !== null) manifests.push("setup.py");

  // poetry uses [tool.poetry] in pyproject; otherwise assume pip-based.
  const buildTool: BuildTool =
    pyproject !== null && pyproject.toLowerCase().includes("[tool.poetry]") ? "poetry" : "pip";

  const text = `${pyproject ?? ""}\n${requirements ?? ""}\n${setupPy ?? ""}`.toLowerCase();
  const testFramework: TestFramework = text.includes("pytest") ? "pytest" : "unknown";

  const linters: string[] = [];
  for (const tool of ["ruff", "flake8", "black", "isort", "mypy"]) {
    if (text.includes(tool)) linters.push(tool);
  }

  return { matched: true, buildTool, testFramework, linters, manifests };
}
