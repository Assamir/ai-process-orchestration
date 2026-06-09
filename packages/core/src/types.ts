// Shared types for the QA-process orchestration scaffolder.
// Identifiers and on-disk JSON keys are English.

export type Language = "node" | "java" | "python";

export type BuildTool =
  | "npm"
  | "pnpm"
  | "yarn"
  | "maven"
  | "gradle"
  | "pip"
  | "poetry"
  | "unknown";

/**
 * Test-automation frameworks we detect / scaffold for: the JVM + JS profile
 * (Playwright TS/Java, RestAssured/JUnit/TestNG) plus pytest as a first-class
 * Python stack (detected, wizard default, QA advice, and MCP results wiring).
 */
export type AutomationFramework =
  | "playwright-ts"
  | "playwright-java"
  | "restassured"
  | "junit5"
  | "testng"
  | "pytest"
  | "unknown";

export type ReportLanguage = "en" | "pl";

export type AutonomyLevel = "low" | "medium" | "high";

/** Result of the static, no-LLM project analysis in phase 1. */
export interface DetectedStack {
  /** Primary language inferred from build manifests. `null` when nothing matched. */
  language: Language | null;
  buildTool: BuildTool;
  /** Every automation framework found (e.g. RestAssured + JUnit on the JVM). */
  frameworks: AutomationFramework[];
  /** Best single pick used to seed wizard defaults; `unknown` when none found. */
  primaryFramework: AutomationFramework;
  /** Linters/formatters detected from their config files or dependencies. */
  linters: string[];
  /** Build manifests that were actually found, relative to the scanned root. */
  manifests: string[];
}

/** Answers gathered from the interactive wizard (overrides detection defaults). */
export interface WizardAnswers {
  automationFramework: AutomationFramework;
  reportLanguage: ReportLanguage;
  autonomyLevel: AutonomyLevel;
  /** Seeded QA conventions text the developer can refine. */
  qaConventions: string;
}

/** A single platform we can scaffold for. */
export type PlatformId = "claude" | "copilot";

/** Persisted handoff state written to context/.scaffold/manifest.json for phase 2. */
export interface ScaffoldManifest {
  schemaVersion: 1;
  generatedAt: string;
  platform: PlatformId;
  stack: DetectedStack;
  choices: WizardAnswers;
  /** Logical skill names that were rendered, for phase-2 reference. */
  skills: string[];
}

/** A file an adapter wants written, relative to the target repo root. */
export interface WriteFile {
  /** Path relative to the target repo root, POSIX-style. */
  rel: string;
  content: string;
}

/** Outcome of writing a single file during scaffolding. */
export interface WriteResult {
  path: string;
  status: "created" | "skipped";
}
