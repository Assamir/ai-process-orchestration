---
name: {{SKILL_NAME}}
description: Complete the multi-agent AI configuration scaffolded under /.ai. Interview the developer for one agent at a time, then fill the guideline templates and write a finished /.ai/agents/<name>.md. Use when the user wants to add or finalize an AI agent definition in this project.
---

# {{SKILL_NAME}} — phase 2 (dynamic configuration)

You complete the work started by `claude-agent-scaffold` (phase 1). Phase 1 detected
the stack and laid down `/.ai/` with `{{PLACEHOLDER}}` markers. Your job is to fill
those in and produce finished agent definitions — interactively, with recommendations.

All output you write to files is in **English**.

## On start

1. Read `/.ai/.scaffold/manifest.json` for the detected stack and the developer's
   phase-1 choices (test framework, coding standards, naming conventions). Do not
   re-scan the repo for this; the manifest is the source of truth.
2. Skim `/.ai/AGENTS.md` and `/.ai/guidelines/*` to see what is already filled and
   what `{{PLACEHOLDER}}` markers remain.

## Interview (seed — expand as needed)

Ask the developer, one question at a time, and recommend options as you go:

1. **Name** — what is this agent called?
2. **Responsibility** — its single business responsibility (what it owns end to end)?
3. **External APIs / tools** — what does it integrate with?

Then ask focused follow-ups only where the answers leave a `{{PLACEHOLDER}}` ambiguous
(boundaries/handoffs, autonomy, edge cases, required tools). Suggest concrete defaults
rather than asking open-ended questions.

## Produce the configuration

- Create `/.ai/agents/<name>.md` from the shape of `/.ai/agents/example-agent.md`,
  replacing every `{{PLACEHOLDER}}` with concrete content. Use a kebab-case filename.
- Fill remaining `{{PLACEHOLDER}}` markers in `AGENTS.md` and `guidelines/*` as the
  conversation resolves them. Leave a marker in place only if still genuinely unknown.
- Keep each file focused and actionable; do not add generic boilerplate the model
  already knows. Record only project-specific, non-obvious rules.

## Non-negotiable

- Enforce the **iron QA rule**: every agent definition must require code covered by
  tests in **{{TEST_FRAMEWORK}}**. Do not remove or weaken this.
- Never overwrite an existing `/.ai/agents/<name>.md` without confirming with the user.

## Model recommendation

Routine generation works well on Claude Sonnet (`claude-sonnet-4-6`). For complex,
architecturally critical meta-templates, switch the session to Claude Opus
(`claude-opus-4-8`) before running this skill.
