import type { BuildTool, TestFramework } from "../types.js";
import { readIfExists } from "../util/fs.js";

export interface JavaDetection {
  matched: boolean;
  buildTool: BuildTool;
  testFramework: TestFramework;
  linters: string[];
  manifests: string[];
}

/**
 * Detect a Java project from Maven/Gradle manifests. MVP parsing is substring-based
 * over the manifest text (no XML/Groovy parser) — enough to spot JUnit and common
 * quality plugins. Replace with real parsers later if precision matters.
 */
export function detectJava(root: string): JavaDetection {
  const pom = readIfExists(root, "pom.xml");
  const gradleGroovy = readIfExists(root, "build.gradle");
  const gradleKts = readIfExists(root, "build.gradle.kts");
  const gradle = gradleGroovy ?? gradleKts;

  if (pom === null && gradle === null) {
    return { matched: false, buildTool: "unknown", testFramework: "unknown", linters: [], manifests: [] };
  }

  const manifests: string[] = [];
  if (pom !== null) manifests.push("pom.xml");
  if (gradleGroovy !== null) manifests.push("build.gradle");
  if (gradleKts !== null) manifests.push("build.gradle.kts");

  const buildTool: BuildTool = pom !== null ? "maven" : "gradle";
  const text = `${pom ?? ""}\n${gradle ?? ""}`.toLowerCase();

  // junit-jupiter == JUnit 5. Plain "junit" (4) is also surfaced as junit5 for the
  // guideline's purpose, since the iron QA rule only needs the family name.
  const testFramework: TestFramework =
    text.includes("junit-jupiter") || text.includes("junit") ? "junit5" : "unknown";

  const linters: string[] = [];
  for (const tool of ["checkstyle", "spotless", "pmd", "spotbugs"]) {
    if (text.includes(tool)) linters.push(tool);
  }

  return { matched: true, buildTool, testFramework, linters, manifests };
}
