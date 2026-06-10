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

  const ordered: Array<[Language, DetectorResult]> = [
    ["node", node],
    ["java", java],
    ["python", python],
  ];
  const primary = ordered.find(([, d]) => d.matched);

  const primaryFramework =
    FRAMEWORK_PRIORITY.find((fw) => frameworks.includes(fw)) ?? "unknown";

  if (!primary) {
    return { language: null, buildTool: "unknown", frameworks, primaryFramework, linters, observability, manifests };
  }

  const [language, detection] = primary;
  return {
    language,
    buildTool: detection.buildTool,
    frameworks,
    primaryFramework,
    linters,
    observability,
    manifests,
  };
}
