<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Documentation standard

> Phase 1 seeded this standard. Phase 2 records this project's doc conventions in the `{{PLACEHOLDER}}` section.

Every document this orchestration generates — a foundation doc, a reference/knowledge pillar, a refinement, a runtime artifact under `context/changes/` — conforms to **one shape**, so the whole `context/` system of record is uniform and machine-checkable. This is the meta-standard the pillars rest on. It does **not** restate the rules other guidelines already own; it **composes** them and adds the four structural rules that make a generated doc parseable. It references — never duplicates — `grounding` (every claim cites a real artifact), `diagram-conventions` (diagrams are Mermaid, fenced and guarded), and `documentation-as-code` (docs are versioned in-repo, reviewed in PR, and gated by `doctor` in CI).

## Two tiers (read from the path)
A document's tier is read from where it lives, so `doctor` checks the right contract:
- **Durable docs** — `context/foundation/`, `context/reference/` (P1), `context/knowledge/` (P2), `context/refinements/` (P2). The long-lived structural map of the system. Get the **full** standard below.
- **Runtime artifacts** — `context/changes/<work-id>/*`. The trace of one unit of work; their shape lives in the artifact registry (`work`/`plan`/`cases`/`automation`/…). Get the **light** standard.

## The full standard (durable docs)
- **YAML frontmatter** at the very top, between `---` fences, carrying at least:
  | Key | Meaning |
  |-----|---------|
  | `title` | the document's human title (matches the H1) |
  | `version` | semver of the doc, bumped on a substantive edit |
  | `last-updated` | ISO date of the last substantive edit |
  | `owner-skill` | the skill responsible for keeping it current |
  | `status` | `seeded` (phase-1 skeleton) → `draft` → `current` |
- **A single H1.** Exactly one `#` heading — the document title — then a strict `##` → `###` hierarchy. Never a second H1; never skip a level.
- **"When to use this document."** An opening lede (the `>` blockquote the seeded docs carry) that says in one or two sentences when a reader should reach for this doc and what they'll get — so an agent pulls the right doc just-in-time instead of reading everything.
- **Length discipline (anti-bloat).** A doc earns its length. Link out to source (`grounding`) and to sibling docs instead of restating them; a foundation/reference doc that grows past ~1–2 screens of prose is a smell — split it (by C4 level, by the repo map, or by domain) rather than letting it sprawl. "What's not in context doesn't exist" is not a licence to write everything down: record what an agent can't infer, link the rest.

## The light standard (runtime artifacts)
- Frontmatter carries `status` (the work-item lifecycle the validator gates on) and the `work-id`; the rest of the shape is the trace markers (`AC<n>` / `Traces to:` / `Covers:`) and the `requiredSections` the artifact registry defines. Don't bolt the durable five-key frontmatter onto a runtime artifact — its provenance lives in the registry, not in frontmatter.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — a durable doc with conformant frontmatter, one H1, a when-to-use lede, and a link instead of a restatement:
```markdown
---
title: System reference — C4 index
version: 1.2.0
last-updated: 2026-06-25
owner-skill: qa-reverse-engineer
status: current
---
# System reference — C4 index

> Read this first to orient on the architecture before planning tests; it links to the C4 levels and the test surface.

## Architecture (C4)
- L1 — System context: [c4-context.md](./c4-context.md)   <!-- link, don't restate -->
```

❌ **Avoid** — no frontmatter, two H1s, a wall of prose that duplicates the source instead of citing it:
```markdown
# Overview
…three screens restating what AuthService already does, with no file:line citation…
# Also the database            <!-- second H1; should be a ## under one title -->
```

## Applicable patterns

> Encouraged: the doc patterns this project standardizes on (a frontmatter linter, a docs ToC,
> "one concept per file", generated-from-source reference docs) so agents follow them.

{{DOCUMENTATION_PATTERNS}}

## Project-specific documentation workflow

> Record this project's concrete conventions once known: where the doc version/owner registry lives, the
> max-length rule you enforce, and who signs off a `status: current`.

{{PROJECT_DOCUMENTATION_WORKFLOW}}

## Extended — documentation hierarchy & content standards

> Maintainer reference (adapted from the project-documentation source). The lean tier above is the deployed
> contract (the machine-checkable shape); this records the human conventions around it.

### Documentation hierarchy (read top-down)
1. **Entry point** — a root `README` that orients a newcomer and links onward; it never duplicates the
   detail below it.
2. **Durable structural docs** — `context/foundation/` (strategy, framework, environments, repo map),
   `context/reference/` (P1 system docs, C4), `context/knowledge/` (P2 domain). The long-lived map.
3. **Runtime artifacts** — `context/changes/<work-id>/` (plan/cases/automation), the trace of one unit of work.
A reader pulls the **right altitude** for their question; an agent reads the lede to decide, then the doc.

### Single source of truth
Each fact lives in **exactly one** doc and is **linked**, never copied. A duplicated fact is a future
contradiction — when one copy is updated and the other isn't, the reader can't tell which is current. If
two docs need the same fact, one owns it and the other links. Generated docs (this catalog, the C4 set,
`skill-catalog.md`) are regenerated from source, never hand-edited, so they cannot drift.

### Content standards (beyond the frontmatter contract)
- **Lede first.** The `>` "when to use this document" blockquote is mandatory — it lets an agent decide
  whether to read on without loading the whole file.
- **Length is earned.** Link out to source (`grounding`) and to sibling docs instead of restating them.
  A foundation/reference doc past ~1–2 screens of prose is a smell — split it (by C4 level, repo map, or
  domain). "What's not in context doesn't exist" is not a licence to write everything down: record what an
  agent can't infer, link the rest.
- **One H1, strict hierarchy.** Exactly one `#` (the title), then `##` → `###` with no skipped levels
  and never a second H1.
- **Diagrams are Mermaid, fenced and guarded** (`diagram-conventions` + `code-formatting`); never a
  pasted screenshot for something that could be a diagram.

### Documentation as code
Docs are versioned in-repo, reviewed in the same PR as the change they describe, and validated by
`doctor` in CI (see `documentation-as-code`). A doc PR that fails `doctor` fails the build, exactly like
a failing test.
