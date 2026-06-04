# claude-agent-scaffold

A two-phase scaffolder for multi-agent AI setups.

- **Phase 1 — `npx` installer (static, no LLM).** Detects your stack from build
  manifests (`package.json`, `pom.xml`/`build.gradle`, `pyproject.toml`/…), runs a
  short wizard to confirm the test framework, coding standards, and naming
  conventions, then writes a `/.ai` guideline structure from templates with
  `{{PLACEHOLDER}}` markers and installs the phase-2 Claude Code skill.
- **Phase 2 — Claude Code skill (dynamic, LLM).** You run the installed skill inside
  Claude Code; it interviews you per agent and fills the placeholders into finished
  `/.ai/agents/<name>.md` definitions.

## Usage

```bash
npx claude-agent-scaffold init
# options:
#   --root <dir>          target project (default: cwd)
#   --skill-name <name>   installed skill name (default: agent-config)
#   -y, --yes             skip the wizard, accept detected defaults (non-interactive / CI)
```

Then open Claude Code in the project and run the `agent-config` skill.

> Full step-by-step setup, options, and troubleshooting: see [INSTALL.md](INSTALL.md).

## What phase 1 writes

```
.ai/
  AGENTS.md                       # root guidelines + iron QA rule (test framework)
  guidelines/coding-standards.md
  guidelines/naming-conventions.md
  agents/example-agent.md         # placeholder agent to copy
  .scaffold/manifest.json         # handoff state for phase 2
.claude/skills/<name>/SKILL.md    # the phase-2 skill
```

Existing files are never overwritten — delete `/.ai` to regenerate.

## Development

```bash
npm install
npm run build      # tsup -> dist/ (+ copies templates)
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

### Packaging the npx package

`dist/` is built automatically before packing/publishing (`prepack`), so the published
package always ships a fresh build.

```bash
npm run pack:check    # build + npm pack --dry-run: list what would ship, no tarball
npm run pack:tarball  # build + npm pack: produce claude-agent-scaffold-<version>.tgz
npm run release       # runs typecheck + tests + build, then npm publish
```

Test the packed tarball through `npx` before publishing:

```bash
npm run pack:tarball
npx ./claude-agent-scaffold-0.1.0.tgz --help
```

Requires Node.js ≥ 20. The whole tool (CLI and generated guidelines) is in English.
