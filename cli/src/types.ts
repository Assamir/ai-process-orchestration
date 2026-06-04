// Shared types for the scaffolder. Identifiers and on-disk JSON keys are English.

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

export type TestFramework =
  | "vitest"
  | "jest"
  | "junit5"
  | "pytest"
  | "unknown";

/** Result of the static, no-LLM project analysis in phase 1. */
export interface DetectedStack {
  /** Primary language inferred from build manifests. `null` when nothing matched. */
  language: Language | null;
  buildTool: BuildTool;
  /** Best-guess test framework from dependencies; `unknown` when none found. */
  testFramework: TestFramework;
  /** Linters/formatters detected from their config files or dependencies. */
  linters: string[];
  /** Build manifests that were actually found, relative to the scanned root. */
  manifests: string[];
}

/** Answers gathered from the interactive wizard (overrides detection defaults). */
export interface WizardAnswers {
  testFramework: TestFramework;
  codingStandards: string;
  namingConventions: string;
}

/** Persisted handoff state written to /.ai/.scaffold/manifest.json for phase 2. */
export interface ScaffoldManifest {
  schemaVersion: 1;
  generatedAt: string;
  stack: DetectedStack;
  choices: WizardAnswers;
  skillName: string;
}

/** Outcome of writing a single file during scaffolding. */
export interface WriteResult {
  path: string;
  status: "created" | "skipped";
}
