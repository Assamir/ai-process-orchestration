# claude-agent-scaffold — Installation & User Guide

A step-by-step guide to installing and using **claude-agent-scaffold**, the two-phase
tool that sets up a multi-agent AI configuration in your project.

- **Phase 1 — installer (`npx`, static, no LLM):** detects your stack, runs a short
  wizard, and writes a `/.ai` guideline structure plus a Claude Code skill.
- **Phase 2 — skill (LLM, inside Claude Code):** interviews you per agent and fills the
  generated templates into finished agent definitions.

---

## 1. Prerequisites

| Requirement | Why | Check |
| --- | --- | --- |
| **Node.js ≥ 20** | Runs the phase-1 CLI | `node --version` |
| **A target project** | The repo you want to add agents to (Node, Java, or Python) | — |
| **Claude Code** | Only for phase 2 (the dynamic, LLM step) | `claude --version` |
| **An interactive terminal (TTY)** | The wizard needs one — or use `--yes` | — |

> No API key is required. Phase 1 never calls the Anthropic API; all LLM work happens
> in phase 2 inside Claude Code, which manages the model for you.

---

## 2. Installation

### Option A — run with `npx` (recommended, once published)

No install needed; `npx` fetches and runs the latest version:

```bash
npx claude-agent-scaffold init
```

### Option B — run from source (this repository)

Use this while the package is not yet on the npm registry, or to develop it.

```bash
# from the repo root
cd cli
npm install
npm run build          # produces dist/index.js (+ dist/templates)

# run it against your target project:
node dist/index.js init --root /path/to/your/project
```

> Tip: `npm link` inside `cli/` exposes a global `claude-agent-scaffold` command that
> points at your local build, so you can run `claude-agent-scaffold init` anywhere.

---

## 3. Phase 1 — run the installer

From inside your target project (or with `--root` pointing at it):

```bash
npx claude-agent-scaffold init
```

What happens, step by step:

1. **Stack detection.** The tool scans for build manifests — `package.json`,
   `pom.xml` / `build.gradle`, `pyproject.toml` / `requirements.txt` / `setup.py` —
   and infers the language, build tool, test framework, and linters.
2. **Wizard.** It shows what it found and asks you to confirm or adjust:
   - **Test framework** to enforce in the agents' QA rule (default comes from detection).
   - **Coding standards** (pre-filled from detected linters; edit freely).
   - **Naming conventions** (sensible defaults per language; edit freely).
3. **Scaffolding.** It writes the `/.ai` structure and the phase-2 skill. Existing
   files are **never overwritten** — they are reported as `skipped`.
4. **Summary.** It prints what was created/skipped and tells you the next step.

### Command-line options

| Option | Default | Description |
| --- | --- | --- |
| `--root <dir>` | current directory | Target project to scaffold into |
| `--skill-name <name>` | `agent-config` | Name of the installed Claude Code skill |
| `-y`, `--yes` | off | Skip the wizard and accept detected defaults (non-interactive / CI) |
| `-h`, `--help` | — | Show help |

Non-interactive example (e.g., CI, or when there is no TTY):

```bash
npx claude-agent-scaffold init --root . --yes
```

---

## 4. What phase 1 creates

```
.ai/
  AGENTS.md                          # root guidelines + the iron QA rule (test framework)
  guidelines/
    coding-standards.md              # seeded from detected linters
    naming-conventions.md            # seeded per language
  agents/
    example-agent.md                 # placeholder agent to copy
  .scaffold/
    manifest.json                    # handoff state read by phase 2 (do not edit by hand)
.claude/
  skills/<skill-name>/SKILL.md       # the phase-2 skill
```

`{{PLACEHOLDER}}` markers that static analysis cannot resolve are left in place on
purpose — phase 2 fills them in.

---

## 5. Phase 2 — complete the setup in Claude Code

1. Open **Claude Code** in the same project:
   ```bash
   claude
   ```
2. Run the installed skill (default name `agent-config`):
   ```
   /agent-config
   ```
3. The skill:
   - reads `.ai/.scaffold/manifest.json` for the detected stack and your choices,
   - interviews you for one agent at a time — seed questions are **name**,
     **responsibility**, and **external APIs/tools** — and recommends options,
   - fills the `{{PLACEHOLDER}}` markers and writes a finished
     `.ai/agents/<name>.md` definition.

> **Model tip:** routine generation works well on Claude Sonnet (`claude-sonnet-4-6`).
> For complex, architecturally critical agents, switch the session to Claude Opus
> (`claude-opus-4-8`) before running the skill.

Repeat the skill for each agent you need.

---

## 6. Re-running and regenerating

- Re-running `init` is **safe and idempotent**: every existing file is reported as
  `skipped`, nothing is overwritten.
- To regenerate from scratch, delete the `/.ai` directory (and the
  `.claude/skills/<name>` folder) and run `init` again.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `TTY initialization failed` / wizard crashes | Running without an interactive terminal (piped input, some CI) | Add `--yes` to skip the wizard |
| `No supported build manifest found` | No `package.json` / `pom.xml` / `build.gradle` / `pyproject.toml` in `--root` | Run from the project root, or `--root` it; the tool still scaffolds with generic defaults |
| Files show as `skipped` and nothing changes | `/.ai` already exists | Delete `/.ai` to regenerate, or edit the files directly |
| `claude-agent-scaffold: command not found` | Package not published / not linked | Use Option B (run from source) or `npm link` in `cli/` |
| The `/agent-config` skill isn't listed in Claude Code | Skill not installed in this project | Confirm `.claude/skills/<name>/SKILL.md` exists; re-run phase 1 |

---

## 8. Uninstall / cleanup

The tool only writes files into your project; there is nothing global to remove.

```bash
rm -rf .ai .claude/skills/agent-config
```

(If you used `npm link`, run `npm unlink -g claude-agent-scaffold` to remove the global command.)
