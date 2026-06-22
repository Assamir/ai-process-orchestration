import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { AutomationFramework, DetectedStack, Language } from "../types.js";
import { detectJava } from "./java.js";
import { detectNode, type DetectorResult } from "./node.js";
import { detectPython } from "./python.js";

/**
 * Preference order when a repo has several frameworks (e.g. JVM repos usually
 * carry RestAssured *and* a JUnit/TestNG runner). The end-to-end / API driver
 * wins over the bare runner, because that is what the QA skills key off.
 */
const FRAMEWORK_PRIORITY: AutomationFramework[] = [
  "playwright-ts",
  "playwright-java",
  "restassured",
  "pytest",
  "testng",
  "junit5",
];

/**
 * Run all stack detectors over `root` and fold them into a single DetectedStack.
 *
 * Polyglot repos are possible, so we collect manifests/linters/frameworks across
 * every detector but pick one primary language by priority (node > java > python).
 * The primary framework is the highest-priority framework found anywhere.
 */
export function detectStack(root: string): DetectedStack {
  const node = detectNode(root);
  const java = detectJava(root);
  const python = detectPython(root);

  const manifests = [...node.manifests, ...java.manifests, ...python.manifests];
  const linters = [...new Set([...node.linters, ...java.linters, ...python.linters])];
  const frameworks = [...new Set([...node.frameworks, ...java.frameworks, ...python.frameworks])];
  const observability = [...new Set([...node.observability, ...java.observability, ...python.observability])];
  // Performance tooling is orthogonal to the functional runner: fold the
  // manifest signals from every detector, then add `jmeter` if a `.jmx` test plan
  // exists anywhere in the repo (the common standalone-JMeter case, no build entry).
  const performance = [...new Set([...node.performance, ...java.performance, ...python.performance])];
  if (!performance.includes("jmeter") && hasJmxFile(root)) performance.push("jmeter");

  const ordered: Array<[Language, DetectorResult]> = [
    ["node", node],
    ["java", java],
    ["python", python],
  ];
  const primary = ordered.find(([, d]) => d.matched);

  const primaryFramework =
    FRAMEWORK_PRIORITY.find((fw) => frameworks.includes(fw)) ?? "unknown";

  if (!primary) {
    return { language: null, buildTool: "unknown", frameworks, primaryFramework, linters, observability, performance, manifests };
  }

  const [language, detection] = primary;
  return {
    language,
    buildTool: detection.buildTool,
    frameworks,
    primaryFramework,
    linters,
    observability,
    performance,
    manifests,
  };
}

/** Directories never worth walking when scanning for a `.jmx` plan. */
const JMX_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "target",
  ".gradle",
  ".venv",
  "venv",
  "__pycache__",
  "vendor",
]);

/**
 * Bounded, deterministic scan for a JMeter `.jmx` test plan anywhere under `root`.
 * Standalone JMeter has no build-manifest signal, so the plan file itself is the
 * detection. Depth-capped and noise-dir-skipped in the spirit of `detect/`; stops
 * at the first hit.
 */
function hasJmxFile(root: string, depth = 0): boolean {
  if (depth > 6) return false;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".jmx")) return true;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (JMX_SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    if (hasJmxFile(join(root, e.name), depth + 1)) return true;
  }
  return false;
}
