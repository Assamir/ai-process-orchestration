<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Multi-repo workspace boundaries

> Phase 1 seeded this standard. Phase 2 records this workspace's concrete repo topology in the `{{PLACEHOLDER}}` section.

This orchestration can run over a **parent folder holding several repositories**: one **test repo** — the repo that carries the test framework, where *all* orchestration artifacts (this `context/` system of record, the skills/prompts, the MCP config, the manifest) live — and one or more **developer repos** holding the application source. The boundary is absolute: **the test repo is the only writable area; the developer repos are read-only source.** Skills read application code at `../<repo>/file:line` to plan, design, and ground tests, but they **never create, edit, or delete a file in a developer repo** — those repos belong to the product teams, and a stray test artifact in one is a leak, the same class of mistake as a committed secret. On a single-repo workspace this guideline is inert (there are no developer repos), and everything behaves as it always has.

## Rules
- **One writable root.** Every file the tool or its agents write lands inside the test repo. If a task seems to need a change in a developer repo (a fixture, a test hook, a build tweak), that is a request to the owning team — raise it, don't make it.
- **Developer repos are read-only source.** Read them to understand the system and to ground claims (`../<repo>/src/...#Lnn`), exactly as you read the test repo's own source. Reference them as **inline-code relative paths** (`../<repo>/`), never as Markdown links, so the reference can't rot into a broken-link error.
- **Resolve source across the workspace.** A developer repo sits at `../<repo>/` relative to the test repo. The dev-repo list lives in `context/foundation/repo-map.md` ("External source repositories") and the manifest's `workspace` block — read it to know which repos are in scope.
- **The editor enforces it too.** The generated `.code-workspace` pins the developer-repo folders read-only (`files.readonlyInclude`), and `doctor` fails the build if any scaffold output leaks into a developer-repo tree. Persuasion (this rule), a native guardrail (the editor), and an out-of-loop check (`doctor`) reinforce each other — none is a substitute for keeping the boundary in mind.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — read application source from the dev repo, write the test + docs into the test repo:
```
read   ../payments-api/src/checkout/Limiter.java#L40-L58   (ground the AC)
write  tests/checkout/rate-limit.spec.ts                   (test, in the test repo)
write  context/changes/checkout-rate-limit/cases.md        (doc, in the test repo)
```

❌ **Avoid** — writing into a developer repo (a leak; not ours to change):
```
write  ../payments-api/src/test/FixtureHack.java   # editing read-only source
write  ../payments-api/.claude/skills/...          # scaffolding into a dev repo
```

## Applicable patterns

> Encouraged: the workspace patterns this team uses (a parent `.code-workspace`, a dedicated test repo per
> product, `files.readonlyInclude` pins, cross-repo `../<repo>/` source references) so agents follow them.

{{MULTI_REPO_PATTERNS}}

## Project-specific workspace topology

> Record this workspace's concrete topology once known: which repo is the test repo, the developer repos in
> scope and what each owns, and how source is shared (relative paths, the `.code-workspace`).

{{PROJECT_MULTI_REPO_WORKFLOW}}

## Extended — repo scope & exclusions

> Maintainer reference (generalized from the excluded-repos source). The lean tier above is the deployed
> contract (the write boundary). This records how to decide which repos are even *in scope to read*.

### Three scope tiers
- **In scope (read freely)** — the developer repos chosen at `init`, holding the application source under
  test. Read them at `../<repo>/file:line` to plan and ground tests.
- **Hard exclusions (never read or cite)** — third-party tooling not owned by the team, contract-test repos
  with separate ownership/lifecycle, and the test repo *itself* when it would be mis-attributed as the
  system under test. Do **not** read their source for factual claims, cite their files in analysis/RCA/
  refinement output, draw their classes in diagrams, or recommend changes to them. If a ticket references
  one, mark `[Out of scope: <repo>]` and ask the user how to proceed.
- **Soft exclusions (avoid unless asked)** — archived repos (read-only historical context) and build-output
  directories (`*-target/`, `dist/`, `build/` — never a source of truth).

### Self-reference discipline
When documenting a *tested service*, the owning component is the **service**, never the test repo — the
test class that found a bug is referenced as "detected by `<TestClass>` in the test repo", which is
documentation, not scope inclusion. Only when the work is *about the test framework itself* is the test
repo the analysis target.

### Why this composes with the write boundary
The lean tier forbids *writing* to dev repos; this tier narrows what you even *read*. Together they keep
analysis grounded in the right sources (no third-party noise, no build artifacts) and keep every generated
artifact inside the one writable test repo. When in doubt about a repo's tier, ask the user — guessing
scope is the same class of error as guessing a fact (`grounding`).

### ✅ / ❌
- ✅ ground an AC in `../payments-api/src/checkout/Limiter.java#L40-L58`; mark a ticket touching a
  third-party repo `[Out of scope: reportportal]` and ask.
- ❌ cite `../some-vendor-fork/...` in an analysis, or treat `../app/target/...` build output as the spec.
