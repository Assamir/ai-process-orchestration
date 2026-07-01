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
  /**
   * (R-091, forward-looking) Security / DAST tooling detected in the stack (e.g.
   * `zap`). Orthogonal to `frameworks`, like `performance`. No detector populates
   * it yet — that lands with the `qa-security` skill (R-055) — but the
   * `security-testing` guideline's `when: { security }` reads it, and the wizard
   * override (R-092) can opt it in regardless. Optional so existing `DetectedStack`
   * literals and pre-R-091 manifests stay valid; treated as `[]` when absent.
   */
  security?: string[];
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
  /**
   * (R-065) Wire the opt-in **Xray** MCP server (Jira test issue types: Test /
   * Test Execution / Test Plan / Test Set) alongside `atlassian`, with `${VAR}`
   * secret indirection. Off by default (and under `--yes`/CI). Optional so
   * pre-R-065 callers/manifests stay valid.
   */
  xrayMcp?: boolean;
  /**
   * (R-065) Wire the opt-in **markitdown** MCP server (`microsoft/markitdown`),
   * which converts binary attachments (`.docx/.pdf/.pptx/.xlsx/.html/.msg/.epub`)
   * to Markdown from a **local path**. No secrets. Off by default. Optional so
   * pre-R-065 callers/manifests stay valid.
   */
  markitdownMcp?: boolean;
  /**
   * (R-091) The guideline names deployed into this repo — the source of truth
   * `update`/`doctor` read back. `init` records the set it evaluated from each
   * guideline's `when` (R-091), as optionally overridden in the wizard (R-092).
   * Absent on pre-R-091 manifests, in which case the consumer re-evaluates `when`
   * from the stack/choices/workspace (the same fallback `update` uses for
   * `DEVELOPER_REPOS`), so an older scaffold still resolves a correct set.
   */
  guidelines?: string[];
}

/** A single platform we can scaffold for. */
export type PlatformId = "claude" | "copilot";

/**
 * (R-083) Multi-repo workspace topology, recorded in the manifest when `init` ran
 * over a **parent folder holding several repos**: the chosen **test repo** (the
 * write root — where all orchestration artifacts land) and the sibling
 * **developer repos** (read-only application source the skills read but never
 * write). Paths are relative to the parent (just the directory name), never
 * absolute, so the test repo stays portable and nothing machine-specific is
 * committed. Absent on a single-repo scaffold — in which case every command
 * behaves exactly as it did before this field existed (the backward-compatibility
 * invariant).
 */
export interface WorkspaceInfo {
  /**
   * The test repo's directory name relative to the parent (the write root).
   *
   * (R-095) **Semantically overloaded** by the embedded topology: in a dedicated
   * multi-repo workspace this is a test repo *distinct from* every developer repo;
   * in the embedded topology (`testSubpath` present) it is instead the **host**
   * developer repo whose subtree is writable — or `"."` in single-host (one app
   * repo, no siblings). The overload is a conscious trade to reuse this machinery
   * rather than add a parallel type; `doctor` validates the combination.
   */
  testRepo: string;
  /** The developer repos' directory names relative to the parent (read-only source). */
  devRepos: string[];
  /**
   * (R-095) **Embedded test topology** — the POSIX-relative path, inside the host
   * repo (`testRepo`), of the writable **test subtree** (an `e2e/` folder or a
   * build module). Present ⇒ the writable set is the orchestration config at the
   * host root **∪** `{testSubpath}/**`, and everything else (host application
   * source + any other developer repos) is read-only. Absent ⇒ the dedicated
   * multi-repo / single-repo behavior, unchanged (the backward-compatibility
   * invariant). Validated (non-empty, relative, not `"."`, exists, inside the host)
   * by `doctor` and at install.
   */
  testSubpath?: string;
  /**
   * (R-086) The generated `.code-workspace` file's path **relative to the test
   * repo** (e.g. `../my-workspace.code-workspace`, since it lives in the parent,
   * one level up). The one sanctioned write outside the test repo; recorded so
   * `doctor` can grant it a leak-check exception and `update` knows it exists.
   */
  workspaceFile?: string;
}

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
   * (R-083) Multi-repo workspace topology, present only when `init` ran over a
   * parent folder with ≥2 qualifying repos and a test repo was selected. Absent on
   * a single-repo scaffold — its absence is exactly what keeps every command on the
   * single-root code path (the backward-compatibility invariant).
   */
  workspace?: WorkspaceInfo;
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
