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
  /**
   * Cross-run observability/reporting tools detected from dependencies (e.g.
   * `allure`). These keep durable history beyond a single static report dir, so
   * `qa-metrics` can read flakiness/trends; phase 1 wires their result dirs into
   * the result MCP server. Empty when none found.
   */
  observability: string[];
  /**
   * Performance / load-testing tooling detected in the stack (e.g. `jmeter`) —
   * from a build entry (`jmeter-maven-plugin`, a Gradle jmeter plugin) or a `.jmx`
   * test plan found in the repo. Orthogonal to `frameworks` (the functional
   * runner): a repo can drive functional tests with Playwright and load tests with
   * JMeter at once. When present, phase 1 wires the tool's result dirs (the HTML
   * dashboard + `.jtl`) into the result MCP server and the `qa-performance` skill
   * keys off it. Empty when none found (R-046).
   */
  performance: string[];
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
  /**
   * Wire the optional local, custom-built Atlassian (Jira + Confluence) MCP
   * server so `qa-ticket-review` reads tickets/specs directly. Off by default
   * (and under `--yes`/CI) — opt-in, since it needs a local server + secrets.
   */
  atlassianMcp: boolean;
  /**
   * Wire the official Playwright **browser** MCP server (`@playwright/mcp`) for
   * interactive browser exploration in `qa-test-case-design` / `qa-rca`. Off by
   * default (and under `--yes`/CI) — opt-in, since it launches a real browser.
   */
  playwrightMcp: boolean;
}

/** A single platform we can scaffold for. */
export type PlatformId = "claude" | "copilot";

/** Persisted handoff state written to context/.scaffold/manifest.json for phase 2. */
export interface ScaffoldManifest {
  schemaVersion: 1;
  generatedAt: string;
  /** Set by `update --write` (R-034) when this scaffold was last migrated. */
  updatedAt?: string;
  /**
   * (R-038) The package version (`claude`/`copilot-qa-orchestrator`) that last
   * wrote this scaffold — recorded by `init` and refreshed by `update --write`.
   * Lets `update` report `scaffolded X → running Y` and warn on a downgrade, and
   * is the anchor the changelog (R-042) computes its delta from. Absent in
   * manifests written before R-038, in which case the version is reported as
   * "unknown" and `update` proceeds exactly as before.
   */
  toolVersion?: string;
  platform: PlatformId;
  stack: DetectedStack;
  choices: WizardAnswers;
  /** Logical skill names that were rendered, for phase-2 reference. */
  skills: string[];
  /**
   * Map of root-relative path → recorded baseline of the canonical rendered
   * content written at scaffold/update time. Lets `update` prove a file is
   * *pristine* (byte-identical to what we wrote, i.e. untouched by the user)
   * before refreshing it to a newer template.
   *
   * Three historical shapes coexist; `update` reads all of them:
   * - **R-039+** — a {@link FileBaseline} object (`{ hash, content }`). The
   *   `content` is the full rendered *base*, so `update` (and the R-040 3-way
   *   merge) can diff base→new without a git dependency.
   * - **R-034..R-038** — a bare sha256 string (hash only; no base content).
   *   `update` still proves pristineness by hash, but can't merge.
   * - **pre-R-034** — absent entirely, in which case `update` falls back to
   *   additive-only (every differing file is treated as drift).
   */
  files?: Record<string, string | FileBaseline>;
}

/**
 * (R-039) The recorded baseline for one scaffolded file: the sha256 fingerprint
 * plus the full canonical rendered **content** it was taken from. Storing the
 * content makes the manifest a self-contained merge base — `update` can diff the
 * shipped base against the current template (the R-040 3-way merge) without
 * reaching for git history.
 */
export interface FileBaseline {
  /** sha256 hex of the canonical rendered content (the pristine fingerprint). */
  hash: string;
  /** The full canonical rendered content — the *base* for a 3-way merge. */
  content: string;
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
