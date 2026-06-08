# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This is a multi-purpose workspace for AI-process tooling and notes. It is not a single application.

- `packages/` — an **npm-workspaces monorepo** for the QA-process orchestration product: `core` (private shared library), `claude-qa-orchestrator` and `copilot-qa-orchestrator` (the two published npx packages). See its own section below.
- `vscode/auditskill/` — a deployable VS Code GitHub Copilot custom agent (**audit-agents**) that audits a target repo's Copilot configuration for token bloat. Self-contained, zero project dependencies. Separate from `packages/` (it audits config; it does not scaffold).
- `knowledge-markdowns/` — Polish-language course transcripts from **AI Devs 4** (`s01e01`…`s05e05`) and **10xDevs 3** (lekcje o agentach, MCP, Playwright, PRD, etc.). Reference material only — do not treat as source.
- `PRD.md`, `TECH.md` (root, EN) — product + technical design for the QA-orchestration packages. Read these first when working on `packages/`.
- `cli/` — **legacy** `claude-agent-scaffold` (app-dev framing), superseded by `packages/claude-qa-orchestrator`. Not a workspace member; kept only until the maintainer removes it. Do not extend it.

The root `package.json` declares `workspaces: ["packages/*"]` and run-all scripts (`npm run build|test|typecheck`). `vscode/auditskill/` keeps its own zero-dep surface and is not part of the workspaces.

## vscode/auditskill — the audit-agents skill

### What it audits and where it ships

The skill audits **only GitHub Copilot configuration files** in a target repo — never project source code. Audited globs (from `audit-config.yml`):

- `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`
- `.github/prompts/**/*.prompt.md`
- `.github/agents/**/*.agent.md`, `.github/chatmodes/**/*.chatmode.md`
- `.vscode/mcp.json`, `.vscode/settings.json`

**Deployment vs. dev layout.** In this repo the skill lives under `vscode/auditskill/.github/...`. When shipped (per `INSTALL.md`), users unzip it into a target repo root so it becomes `.github/agents/audit-agents.agent.md` + `.github/audit/...`. The agent always invokes helper scripts as `node .github/audit/scripts/*.mjs` with `cwd = workspace root` — keep that path shape if you edit the agent prompt.

### Zero-dep constraint (load-bearing)

The skill must not pollute target repos. There is intentionally no `package.json` / `node_modules`. Helper scripts in `scripts/` are plain ESM modules that import only Node built-ins plus the vendored `_shared.mjs`. Do not add npm dependencies. Token counting uses `tiktoken` *only if globally importable*, otherwise falls back to `chars/4`; both paths must keep working (`scripts/_shared.mjs:getTiktoken`).

### Helper script contract

All scripts are CLI entry points reading `audit-config.yml`:

- `parse-agents.mjs` — parses agent/chatmode frontmatter, computes `declared_tools` vs. `tools_used_in_body`, builds an orchestration graph (subagent + handoff edges) and detects cycles via DFS coloring.
- `count-tokens.mjs` — aggregates tokens per glob group; reports tokenizer used (`tiktoken-cl100k` vs `chars-div-4`).
- `detect-duplicates.mjs` — word-shingled Jaccard across instructions/prompts/agents; threshold from `thresholds.doc_duplication_jaccard`.
- `apply-step.mjs` — applies a single `OPT-###` step. The action JSON is read from a fenced ```action ... ``` block inside the report — do not invent actions from the CLI. Supported `type`s: `delete_lines`, `replace_frontmatter_field`, `extract_section`. Requires exactly one of `--dry-run` or `--write`; `risk: high` requires `--force`.
- `_shared.mjs` — vendored minimal YAML parser, glob walker (`**`, `*`, `?` only — no brace expansion), token estimator, frontmatter parser, `findLatest`, `timestamp` (`YYYY-MM-DDTHH-MM-SS-sssZ`).

Run any script standalone for testing:

```powershell
node vscode/auditskill/.github/audit/scripts/parse-agents.mjs --root <target-repo>
node vscode/auditskill/.github/audit/scripts/count-tokens.mjs --root <target-repo>
node vscode/auditskill/.github/audit/scripts/detect-duplicates.mjs --root <target-repo>
node vscode/auditskill/.github/audit/scripts/apply-step.mjs --id OPT-001 --report <path> --dry-run
```

Requires Node.js ≥ 20.

### Agent mode contract (`audit-agents.agent.md`)

The first word of the user's message routes to a procedure: `scan` | `deep` | `report` | `apply OPT-###[,OPT-###]`. The agent is **read-only outside `apply`**, output is **always Polish**, and state lives in `.github/audit/` (`baseline.json`, `scan-<ts>.json`, `decisions-<ts>.json`, `audit-report-<ts>.md`). Findings IDs (`F-###`) and step IDs (`OPT-###`) are deterministic hashes so re-runs stay stable. When editing the agent prompt, preserve: deterministic IDs, the ```action``` fenced-block contract that `apply-step.mjs` depends on, and the "never modify files outside `apply`" rule.

### Configuration

`audit-config.yml` holds thresholds (`agent_instructions_tokens_warn/crit`, `toolset_size_warn`, `doc_duplication_jaccard`, `mcp_tools_unused_pct`, `handoff_prompt_tokens_warn`, `description_similarity_warn`), glob groups, and `report.language: pl` / `report.max_findings_in_deep`. It also declares `metrics_input.copilot_metrics_snapshot` (`.github/audit/audit-input/metrics.json`) — an optional real Copilot usage snapshot the agent reads to ground unused-tool findings. The vendored YAML parser supports scalars, `- item` arrays, nested 2-space mappings, and inline `[a, b]` — do not introduce YAML features beyond this without extending `_shared.mjs:parseYaml`.

## packages/ — the QA-process orchestration monorepo

Two **independent, separately versioned** npx packages scaffold an AI-driven **QA / testing-process**
orchestration (test planning, ticket review, case design, automation, RCA, test-data generation) into a
target repo — `claude-qa-orchestrator` for Claude Code, `copilot-qa-orchestrator` for GitHub Copilot in
VS Code — with **functional parity**. Both are built on the private `@qa-orch/core`. **These packages and
the files they generate are in English** — a deliberate exception to the Polish user-facing convention.

This is *harness engineering for QA*: scaffold a lean root "map" + a `context/` system of record + a
single-purpose skill suite, not a smarter model. See `PRD.md` / `TECH.md` (esp. TECH.md §11).

### Two-phase architecture (load-bearing)

Keep the static phase and the LLM phase separate.

- **Phase 1 — installer (`npx <pkg> init`), 100% deterministic, NO LLM.** Detects the test stack, runs the `@clack/prompts` wizard (or `--yes`), and writes the platform config + `context/` skeleton with `{{PLACEHOLDER}}` markers. Never calls a model API or reads `ANTHROPIC_API_KEY`.
- **Phase 2 — in the tool (LLM).** Claude: run the `qa-init` skill (`.claude/skills/<name>/SKILL.md`). Copilot: run the `qa-orchestrator` agent / `/qa-init` prompt. Interviews the QA owner and fills the remaining `{{PLACEHOLDER}}` markers.

### Shared core vs. platform adapters (the crux)

- **`packages/core/src/`** holds everything platform-agnostic: `detect/` (Playwright TS/Java, RestAssured/JUnit/TestNG; light parsing; polyglot picks one primary), `wizard/` + `labels.ts` (QA questions/defaults), `render.ts` (`{{KEY}}` substitution, **unknown placeholders left for phase 2**), `model/` (`skills.ts` = the `LogicalSkill` suite; `context.ts` = root-config/guideline/foundation content), `adapters/` (**both** `claudeAdapter` and `copilotAdapter` live here so the parity test can render both), `scaffold/` (orchestrator), and `cli.ts` (`runInit`, the shared CLI shared by both leaves).
- **A `LogicalSkill`'s procedure is written once** in `model/skills.ts`; an adapter renders it to `.claude/skills/<name>/SKILL.md` (with `allowed-tools`) or `.github/prompts/<name>.prompt.md` (+ the `.github/agents/qa-orchestrator.agent.md` router). Functional parity is enforced by the parity test in `core/tests/scaffold.test.ts`.
- **The leaf packages are thin:** `src/index.ts` just calls `runInit(<adapter>, meta)`. Add capability in `core`, not in the leaves.
- **Read-only vs write skills:** `LogicalSkill.readOnly` controls the rendered tool allowlist (Claude `Read,Grep,Glob` vs `+Write,Edit,Bash`; Copilot `codebase,search` vs `+editFiles,runCommands`). Keep this distinction.
- **The iron QA rule** (tests in the chosen `{{AUTOMATION_FRAMEWORK}}`, every case traces to an acceptance criterion) lives in the lean root config so it survives compaction — must not be weakened.

### Build & bundling

- `src/detect/` — one detector per stack (`node.ts`/`java.ts`/`python.ts`) + `index.ts` orchestrator. MVP parsing is intentionally light: `JSON.parse` for `package.json`, substring/regex for `pom.xml`/`build.gradle`/`pyproject.toml`. Polyglot repos collect all manifests but pick one primary by priority **node > java > python**.
- `src/wizard/` — `runWizard` (interactive) and `defaultAnswers` (the `--yes`/CI path); both seed from the same `labels.ts` defaults.
- `src/scaffold/` — `scaffold()` renders templates via `render.ts` (replaces `{{KEY}}`, **leaves unknown placeholders intact for phase 2**) and writes files skip-if-exists.
- `src/install-skill/` — `installSkill()` is a **separate** write step from `scaffold()` (both are invoked from `src/index.ts`, not nested). It renders `templates/skill/SKILL.md` to `.claude/skills/<skill-name>/SKILL.md`, idempotent (skip-if-exists). The skill name comes from `--skill-name` (default `agent-config`).
- `src/templates/` — the `.md` templates (incl. `skill/SKILL.md`). They are read at **runtime**, resolved by `templates-path.ts` relative to `import.meta.url`, which works in both `src/` (vitest) and bundled `dist/` layouts. `tsup.config.ts`'s `onSuccess` copies `src/templates` → `dist/templates`; keep that copy step if you change the build.
- The injected **iron QA rule** in generated guidelines must always require tests in the detected/chosen framework (`{{TEST_FRAMEWORK}}`) — this is the MVP's QA requirement and must not be weakened.

### Commands (run at the repo root)

```powershell
npm install
npm run build      # tsup -> dist/index.js (shebang bin) + dist/templates
npm test           # vitest (single run); npm run test:watch for watch
npm run typecheck  # tsc --noEmit
node dist/index.js init --root <target> --yes   # non-interactive scaffold (CI / smoke test)
node dist/index.js init --root <target> --skill-name my-agents --yes   # custom skill name
npm run pack:check   # build + npm pack --dry-run, to inspect the published tarball contents
```

## Working in this repo

- When asked to change the QA-orchestration behavior or the generated output, edit `packages/core` (skills, content, adapters) — **not** the leaf packages, which are thin wrappers. Run `npm test` (parity test included) after.
- When asked to modify the audit skill, edit files under `vscode/auditskill/` directly; there is no build step.
- When asked about course content, the answer is in `knowledge-markdowns/` (Polish). These files are large (~30–70 KB each) — search with Grep before reading whole files.
- **Language split:** `vscode/auditskill/` and its docs, plus course notes, are Polish — match that when editing those user-facing strings. The `packages/` product (code, identifiers, JSON keys, generated files) and `PRD.md`/`TECH.md` are English.
