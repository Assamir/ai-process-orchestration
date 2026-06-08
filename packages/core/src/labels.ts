import type { AutomationFramework, DetectedStack, Language } from "./types.js";

/** Human-readable name for an automation framework, used in generated guidelines. */
export function frameworkLabel(fw: AutomationFramework): string {
  switch (fw) {
    case "playwright-ts":
      return "Playwright (TypeScript)";
    case "playwright-java":
      return "Playwright (Java)";
    case "restassured":
      return "REST Assured";
    case "junit5":
      return "JUnit 5";
    case "testng":
      return "TestNG";
    case "pytest":
      return "pytest";
    case "unknown":
      return "your test-automation framework";
  }
}

/** Frameworks offered by language, used as a fallback when nothing was detected. */
function frameworksForLanguage(language: Language | null): AutomationFramework[] {
  switch (language) {
    case "node":
      return ["playwright-ts"];
    case "java":
      return ["playwright-java", "restassured", "testng", "junit5"];
    case "python":
      return ["pytest"];
    default:
      return ["playwright-ts", "playwright-java", "restassured"];
  }
}

/**
 * Automation frameworks offered as wizard overrides, ordered with the most likely
 * pick first: detected frameworks lead, then the rest of the language's options.
 */
export function frameworkChoices(stack: DetectedStack): AutomationFramework[] {
  const detected = stack.frameworks;
  const byLanguage = frameworksForLanguage(stack.language);
  const ordered = [...detected, ...byLanguage.filter((fw) => !detected.includes(fw))];
  return ordered.length > 0 ? ordered : ["playwright-ts", "playwright-java", "restassured"];
}

/** Sensible default QA-conventions text seeded into the wizard per framework. */
export function defaultQaConventions(framework: AutomationFramework, linters: string[]): string {
  const enforced =
    linters.length > 0
      ? `Static checks enforced by: ${linters.join(", ")} — run them before every commit.`
      : "No linter/formatter detected — consider adding one and wiring it into CI.";
  const base = frameworkAdvice(framework);
  return `${base} ${enforced}`;
}

function frameworkAdvice(framework: AutomationFramework): string {
  switch (framework) {
    case "playwright-ts":
    case "playwright-java":
      return "Each test is independent and parallel-safe; prefer role/label locators over CSS/XPath; assert on user-visible state; capture trace + screenshot on failure.";
    case "restassured":
      return "One scenario per test; assert status, schema, and body; externalize base URI and auth; keep request specs reusable.";
    case "testng":
    case "junit5":
      return "One behavior per test; arrange-act-assert; no shared mutable state between tests; deterministic, no sleeps.";
    case "pytest":
      return "One behavior per test; use fixtures for setup; parametrize edge cases; no test interdependence.";
    case "unknown":
      return "One behavior per test; deterministic and independent; assert intended behavior, not implementation.";
  }
}
