# TECH — QA Process Orchestration (architecture & contracts)

> Technical design for the twin npx packages described in **PRD.md**. Covers the monorepo layout,
> the shared-core + platform-adapter architecture, module contracts, the logical→platform artifact
> mapping, build/release, and testing strategy.
>
> Status: **Draft v0.1** · Targets Node ≥ 20, ESM.

---

## 1. Monorepo layout

The repo becomes an npm-workspaces monorepo. Only the two leaf packages are published; `core` is a
private workspace bundled into each leaf at build time (so npx users never pull a third package).

```
ai-process-orchestration/
├── package.json                 # private root, "workspaces": ["packages/*"]
├── PRD.md / TECH.md
├── CLAUDE.md                    # updated: cli/ section → packages/*
├── packages/
│   ├── core/                    # @qa-orch/core — private, not published, bundled into leaves
│   │   └── src/{detect,wizard,scaffold,render,model,adapters,util}
│   ├── claude-qa-orchestrator/  # published npx package
│   └── copilot-qa-orchestrator/ # published npx package
├── vscode/auditskill/           # unchanged, separate artifact (Copilot config auditor)
└── knowledge-markdowns/         # reference only
```

The existing `cli/` package is **moved and split**: its platform-agnostic modules become
`packages/core`; its Claude-specific pieces (paths, skill template, CLI messages) become
`packages/claude-qa-orchestrator`. The current package (`claude-agent-scaffold` v0.1.0) is
**superseded** by `claude-qa-orchestrator` (QA domain). Empty `claude/` and `mcp/` are removed.

## 2. Two-phase architecture (preserved from the current CLI)

- **Phase 1 — installer (`npx <pkg> init`), 100% deterministic, NO LLM.** Detects the test stack,
  runs the `@clack/prompts` wizard (or `--yes` for CI), and writes the `context/` skeleton +
  guidelines + platform skill/prompt files with `{{PLACEHOLDER}}` markers, skip-if-exists. Does not
  read `ANTHROPIC_API_KEY` or call any model API.
- **Phase 2 — installed skill/prompt, LLM, runs inside the tool.** Interviews the QA engineer per
  skill and fills the remaining placeholders into finished artifacts.
  - Claude: `.claude/skills/<name>/SKILL.md` (frontmatter `allowed-tools`).
  - Copilot: `.github/prompts/<name>.prompt.md`, orchestrated by `.github/agents/qa-orchestrator.agent.md`.

## 3. Core modules & contracts (`packages/core`)

Reuses the current `cli/src` structure, extended. Key modules and their responsibilities:

- **`detect/`** — `detectStack(root): DetectedStack`. Per-language detectors (`node.ts`, `java.ts`,
  `python.ts`) extended with **test-stack detection** (see §8). Light parsing only: `JSON.parse` for
  `package.json`, substring/regex for `pom.xml` / `build.gradle`. Polyglot collects all, picks one
  primary by priority.
- **`wizard/`** — `runWizard(stack): Answers | null` (interactive) and `defaultAnswers(stack)`
  (`--yes`/CI). Questions reframed for QA (project type, automation framework, report language,
  autonomy level). Both seed from `labels.ts`.
- **`render.ts`** — `render(template, vars): string`. `{{KEY}}` substitution; **unknown placeholders
  left intact** for phase 2. Reused verbatim.
- **`scaffold/`** — `scaffold(input): WriteResult[]`. Writes the `context/` skeleton + guidelines
  (skip-if-exists) + `.scaffold/manifest.json` (phase-2 handoff state).
- **`model/`** — the **logical QA skill definitions**: each skill's name, description, procedure
  body, inputs/outputs, and which `context/` files it reads/writes — expressed once,
  platform-agnostic. This is where functional parity is guaranteed.
- **`adapters/`** — the `PlatformAdapter` interface (see §5) that maps a logical artifact to a
  platform-specific path + frontmatter.
- **`util/fs.ts`** (`exists`, `readIfExists`, `firstExisting`), **`labels.ts`**,
  **`templates-path.ts`** (`templatesDir()` resolved from `import.meta.url`, works in `src/` and
  bundled `dist/`).

Each leaf package is `core` + one `PlatformAdapter` implementation + that platform's templates.

## 4. Platform mapping table (logical artifact → platform)

| Logical artifact | Claude | Copilot |
|---|---|---|
| Lean root config | `CLAUDE.md` | `.github/copilot-instructions.md` |
| Guideline | `.ai/guidelines/*.md` | `.github/instructions/*.instructions.md` |
| Skill (procedure) | `.claude/skills/<name>/SKILL.md` (`allowed-tools`) | `.github/prompts/<name>.prompt.md` |
| Orchestrator/agent | skills + `CLAUDE.md` | `.github/agents/qa-orchestrator.agent.md` (`handoffs[]`) |
| MCP | `.mcp.json` / settings | `.vscode/mcp.json` |
| Quality gates / hooks | `.claude/settings.json` (PostToolUse) | `.github/instructions` + documented manual gate |
| System of record | `context/**` | `context/**` (identical) |

## 5. Skill model & `PlatformAdapter`

A logical skill from `core/model` renders to different surfaces:

- **Claude** → `.claude/skills/<name>/SKILL.md` with YAML frontmatter incl. `allowed-tools`.
- **Copilot** → `.github/prompts/<name>.prompt.md`; cross-skill choreography is expressed via the
  orchestrator agent's `handoffs[]` (frontmatter shape proven by
  `vscode/auditskill/.github/agents/audit-agents.agent.md`: `description`, `model`, `tools[]`,
  `agents[]`, `user-invokable`, `argument-hint`, `handoffs[{label,agent,prompt,send}]`, `target`).

```ts
interface LogicalSkill {
  name: string;                 // e.g. "ticket-review"
  description: string;
  reads: string[];              // context/ paths it consumes
  writes: string[];             // context/ paths it produces
  body: string;                 // procedure text (may contain {{PLACEHOLDER}} for phase 2)
}

interface PlatformAdapter {
  id: "claude" | "copilot";
  rootConfigPath(): string;                         // CLAUDE.md | .github/copilot-instructions.md
  guidelinePath(name: string): string;
  renderSkill(skill: LogicalSkill, vars): WriteFile[]; // -> SKILL.md | prompt.md (+ agent handoff)
  mcpPath(): string;                                // .mcp.json | .vscode/mcp.json
  hooks(vars): WriteFile[];                          // .claude/settings.json | [] (manual gate doc)
}
```

The leaf CLI = parse args → `detectStack` → `runWizard`/`defaultAnswers` → for each `LogicalSkill`
call `adapter.renderSkill` → `scaffold` `context/` + guidelines + adapter outputs.

## 6. Context system of record (platform-agnostic)

```
context/
├── foundation/   test-strategy.md, test-plan.md, tools.md, environments.md, lessons.md
├── changes/<work-id>/   work.md, plan.md, cases.md, automation.md, review.md
└── archive/<work-id>/   (read-only)
```

- The lean root config is an **index**, not a repository; skills fetch from `context/` just-in-time
  (hierarchical / pull-based retrieval, not upfront injection). Critical, non-negotiable rules live in
  the lean root so they **survive context compaction**.
- `foundation/` is edited in place; per-work-item docs live under `changes/<work-id>/`; completed
  items move to `archive/`.
- **Large outputs are offloaded to files** under `changes/<work-id>/` and referenced by path, rather
  than pasted inline — keeps the working context bounded.
- `context/` docs are **machine-readable and cross-linked** (relative links between foundation docs and
  work-items); a deterministic validator (see §11) can check link/section integrity outside the agent loop.
- **Work-item IDs are deterministic hashes** so re-runs stay stable — mirrors the `F-###` / `OPT-###`
  determinism in `vscode/auditskill`.

## 7. Build & release

- **tsup** per leaf package: bundles `core` (via workspace import) into a single ESM `dist/index.js`
  with a `#!/usr/bin/env node` banner, and an `onSuccess` step that copies `src/templates` →
  `dist/templates` (same pattern as the current `cli/tsup.config.ts`). Keep that copy step.
- Each leaf has its own `package.json` `version`, `bin`, `files: ["dist", "README.md"]`, `engines.node >= 20`,
  and `prepublishOnly: typecheck && test && build`. **Independent versioning and release.**
- `@clack/prompts` is the only runtime dep (carried from the current CLI); shared via core, bundled.
- npx smoke test in CI: run each `dist/index.js init --root <tmp> --yes` and assert the output tree.

## 8. Detection details (test stacks)

| Stack | Manifest / marker |
|---|---|
| Playwright (TS/JS) | `@playwright/test` in `package.json`; `playwright.config.{ts,js,mjs}` |
| Playwright (Java) | `com.microsoft.playwright` in `pom.xml` / `build.gradle(.kts)` |
| RestAssured (Java) | `io.rest-assured` in `pom.xml` / `build.gradle(.kts)` |
| JVM runner | JUnit 5 (`org.junit.jupiter`) / TestNG (`org.testng`); Maven vs Gradle (already partly in `detect/java.ts`) |

Detection feeds wizard defaults (chosen automation framework, primary language). The iron QA rule
(carried from the current templates) always requires tests in the detected/chosen `{{TEST_FRAMEWORK}}`.

## 9. Testing strategy

- **vitest** in `core` and each leaf (reuse the current `tempProject()` fixture pattern).
- `detect.test.ts` — extended with Playwright TS/Java and RestAssured fixtures + polyglot priority.
- `render.test.ts` — unchanged contract (known replaced, unknown preserved).
- `scaffold.test.ts` — `context/` tree, manifest validity, idempotency, iron-QA-rule injection.
- **Per-adapter snapshot tests** — render the full skill suite for each platform and assert the
  generated tree; a **parity test** asserts both platforms emit the same set of logical skills and an
  identical `context/` skeleton (only paths/frontmatter differ).

## 10. Compatibility & invariants

- Node ≥ 20, ESM throughout.
- **Never overwrite**: scaffolding is skip-if-exists; regeneration requires deleting `context/` / config.
- Phase 1 never uses an LLM or `ANTHROPIC_API_KEY`.
- Functional parity between packages is an invariant enforced by the parity snapshot test.
- This repo's user-facing skill strings stay PL (per `CLAUDE.md`); package code, identifiers, JSON
  keys, and these design docs are EN.

## 11. Harness-engineering alignment

What we scaffold **is a harness** — the execution environment around the QA agent (what it can read,
which tools it calls, how it validates, when it stops). The patterns below come from OpenAI's
"Harness engineering" (Codex) report and the 10xDevs-3 context-scaling lesson; both say the same thing:
*the harness is the car, the model is the engine.* Concrete commitments for our packages:

- **Map, not a thousand-page manual.** Lean root config (~100 lines) is a **table of contents**;
  knowledge lives in `context/` and is pulled just-in-time (progressive disclosure). This directly
  counters the four failure modes of a monolithic root file: context is scarce, "everything important"
  ⇒ nothing is, instant rot, and un-verifiability.
- **"What's not in context doesn't exist."** QA knowledge stuck in Jira/Slack/people's heads is
  invisible to the agent. The scaffolded `context/foundation/` (test-strategy, test-plan, tools,
  environments, lessons) is the place to **encode** that knowledge as versioned repo artifacts.
- **Plans as first-class artifacts.** `context/changes/<id>/` (active) and `context/archive/` (done)
  mirror Codex's `exec-plans/active|completed`. Add `context/foundation/tech-debt-tracker.md` (or
  `lessons.md`) as a versioned, agent-readable backlog of test debt / known flaky areas / RCA history.
- **Invariants over micromanagement.** Enforce a small set of inviolable rules, not implementation
  detail: the iron QA rule (tests in the detected framework), every test case traces to an acceptance
  criterion, every automated test carries a stable ID, deterministic work-item IDs. Leave *how* to the agent.
- **Mechanical enforcement + remediation-carrying errors.** A deterministic validator (the QA analog
  of `vscode/auditskill`) checks structure, cross-links, and placeholders **outside the agent loop**;
  its findings carry fix instructions so they can be fed back into agent context. **Shipped** as the
  **`doctor`** command (`core/src/doctor/index.ts`, `runDoctor`; exits non-zero on errors). A recurring
  **`gardening`** skill that opens targeted fixes remains on the roadmap.
- **Make test results legible to the agent.** ✅ **Shipped.** The QA analog of Codex's Chrome DevTools /
  observability wiring: phase 1 provisions a read-only `playwright-results` filesystem **MCP server**
  (`.mcp.json` / `.vscode/mcp.json`) over the Playwright HTML report + traces (`core/src/model/mcp.ts`,
  `resultServers`), so `rca` and `test-automate` read outcomes directly instead of relying on copy-paste.
  Both adapters share the server map; only the JSON envelope differs (`mcpServers` vs `servers`).
- **Read-only vs. write skills.** Each `LogicalSkill` is annotated read-only (`ticket-review`,
  `test-case-design`, `rca`) or write (`test-automate`, `automation-bootstrapper`); the adapter encodes
  this as Claude `allowed-tools` and as Copilot agent tool allowlists — schema-level filtering, not prose.
- **Compaction survival.** The handful of inviolable rules live in the lean root so they persist when
  the conversation is compacted over long QA sessions.
