import type { DetectedStack, Language } from "../types.js";
import { detectJava } from "./java.js";
import { detectNode } from "./node.js";
import { detectPython } from "./python.js";

/**
 * Run all stack detectors over `root` and fold them into a single DetectedStack.
 *
 * Polyglot repos are possible, so we collect manifests/linters across every
 * detector but pick one primary language by priority (node > java > python).
 * The primary language's build tool and test framework win.
 */
export function detectStack(root: string): DetectedStack {
  const node = detectNode(root);
  const java = detectJava(root);
  const python = detectPython(root);

  const manifests = [...node.manifests, ...java.manifests, ...python.manifests];
  const linters = [...new Set([...node.linters, ...java.linters, ...python.linters])];

  // Priority order: the first matched detector defines the primary stack.
  const ordered: Array<[Language, { matched: boolean; buildTool: DetectedStack["buildTool"]; testFramework: DetectedStack["testFramework"] }]> = [
    ["node", node],
    ["java", java],
    ["python", python],
  ];
  const primary = ordered.find(([, d]) => d.matched);

  if (!primary) {
    return { language: null, buildTool: "unknown", testFramework: "unknown", linters, manifests };
  }

  const [language, detection] = primary;
  return {
    language,
    buildTool: detection.buildTool,
    testFramework: detection.testFramework,
    linters,
    manifests,
  };
}
