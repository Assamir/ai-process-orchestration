# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This is a multi-purpose workspace for AI-process tooling and notes. It is not a single application.

- `vscode/auditskill/` — the only shipped artifact: a deployable VS Code GitHub Copilot custom agent (**audit-agents**) that audits a target repo's Copilot configuration for token bloat. Self-contained, zero project dependencies.
- `knowledge-markdowns/` — Polish-language course transcripts from **AI Devs 4** (`s01e01`…`s05e05`) and **10xDevs 3** (lekcje o agentach, MCP, Playwright, PRD, etc.). Reference material only — do not treat as source.
- `claude/`, `mcp/` — currently empty placeholders.

There is no top-level build, test, or lint. There is no root `package.json`, `.gitignore`, `README.md`, `.cursorrules`, or `copilot-instructions.md`. All build/lint/test surface lives inside `vscode/auditskill/`.

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

`audit-config.yml` holds thresholds (`agent_instructions_tokens_warn/crit`, `toolset_size_warn`, `doc_duplication_jaccard`, `handoff_prompt_tokens_warn`, `description_similarity_warn`), glob groups, and `report.language: pl`. The vendored YAML parser supports scalars, `- item` arrays, nested 2-space mappings, and inline `[a, b]` — do not introduce YAML features beyond this without extending `_shared.mjs:parseYaml`.

## Working in this repo

- When asked to modify the skill, edit files under `vscode/auditskill/` directly; there is no build step.
- When asked about course content, the answer is in `knowledge-markdowns/` (Polish). These files are large (~30–70 KB each) — search with Grep before reading whole files.
- `INSTALL.md`, `vscode/auditskill/.github/audit/README.md`, and the agent prompt itself are all written in Polish. Match that language when editing user-facing strings; keep code, identifiers, and JSON keys in English.
