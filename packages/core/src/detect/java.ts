import type { AutomationFramework, BuildTool } from "../types.js";
import { readIfExists } from "../util/fs.js";
import type { DetectorResult } from "./node.js";

/**
 * Detect a Java test project from Maven/Gradle manifests. MVP parsing is
 * substring-based over the manifest text (no XML/Groovy parser) — enough to spot
 * Playwright-Java, RestAssured, and the JUnit/TestNG runner.
 */
export function detectJava(root: string): DetectorResult {
  const pom = readIfExists(root, "pom.xml");
  const gradleGroovy = readIfExists(root, "build.gradle");
  const gradleKts = readIfExists(root, "build.gradle.kts");
  const gradle = gradleGroovy ?? gradleKts;

  if (pom === null && gradle === null) {
    return { matched: false, buildTool: "unknown", frameworks: [], linters: [], observability: [], performance: [], manifests: [] };
  }

  const manifests: string[] = [];
  if (pom !== null) manifests.push("pom.xml");
  if (gradleGroovy !== null) manifests.push("build.gradle");
  if (gradleKts !== null) manifests.push("build.gradle.kts");

  const buildTool: BuildTool = pom !== null ? "maven" : "gradle";
  const text = `${pom ?? ""}\n${gradle ?? ""}`.toLowerCase();

  const frameworks: AutomationFramework[] = [];
  if (text.includes("com.microsoft.playwright") || text.includes("playwright")) {
    frameworks.push("playwright-java");
  }
  if (text.includes("io.rest-assured") || text.includes("rest-assured") || text.includes("restassured")) {
    frameworks.push("restassured");
  }
  if (text.includes("testng")) frameworks.push("testng");
  // junit-jupiter == JUnit 5. Plain "junit" (4) is also surfaced as junit5 since
  // the iron QA rule only needs the family name.
  if (text.includes("junit-jupiter") || text.includes("junit")) frameworks.push("junit5");

  const linters: string[] = [];
  for (const tool of ["checkstyle", "spotless", "pmd", "spotbugs"]) {
    if (text.includes(tool)) linters.push(tool);
  }

  // io.qameta.allure / allure-maven / allure-junit5 → durable cross-run history.
  const observability: string[] = [];
  if (text.includes("allure")) observability.push("allure");

  // jmeter-maven-plugin (com.lazerycode.jmeter) or a Gradle jmeter plugin → load testing.
  const performance: string[] = [];
  if (text.includes("jmeter")) performance.push("jmeter");

  return { matched: true, buildTool, frameworks, linters, observability, performance, manifests };
}
