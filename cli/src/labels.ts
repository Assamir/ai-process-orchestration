import type { Language, TestFramework } from "./types.js";

/** Human-readable name for a test framework, used in generated guidelines. */
export function testFrameworkLabel(fw: TestFramework): string {
  switch (fw) {
    case "vitest":
      return "Vitest";
    case "jest":
      return "Jest";
    case "junit5":
      return "JUnit 5";
    case "pytest":
      return "pytest";
    case "unknown":
      return "your project's test framework";
  }
}

/** Test frameworks offered as wizard overrides, ordered with the likely pick first. */
export function testFrameworkChoices(language: Language | null): TestFramework[] {
  switch (language) {
    case "node":
      return ["vitest", "jest"];
    case "java":
      return ["junit5"];
    case "python":
      return ["pytest"];
    default:
      return ["vitest", "jest", "junit5", "pytest"];
  }
}

/** Sensible default naming-convention text seeded into the wizard per language. */
export function defaultNamingConventions(language: Language | null): string {
  switch (language) {
    case "node":
      return "Files kebab-case; types/classes PascalCase; variables/functions camelCase; constants UPPER_SNAKE_CASE.";
    case "java":
      return "Classes PascalCase; methods/fields camelCase; constants UPPER_SNAKE_CASE; packages lowercase.";
    case "python":
      return "Modules/functions/variables snake_case; classes PascalCase; constants UPPER_SNAKE_CASE.";
    default:
      return "Define naming conventions for files, types, functions, and constants.";
  }
}

/** Sensible default coding-standards text, biased by detected linters. */
export function defaultCodingStandards(language: Language | null, linters: string[]): string {
  const enforced =
    linters.length > 0
      ? `Enforced by: ${linters.join(", ")}. Run them before every commit.`
      : "No linter detected — consider adding one and wiring it into CI.";
  const base =
    language === "python"
      ? "Prefer explicit, typed code; keep functions small and pure where possible."
      : "Prefer explicit, strongly-typed code; keep functions small and pure where possible.";
  return `${base} ${enforced}`;
}
