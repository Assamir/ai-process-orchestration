# Design — Guideline tiering (lean/full) + stack-aware deploy

> **Status:** 🚧 planned · **Epic:** R-090 → R-093 (guideline tiering & stack-aware deploy) ·
> **Tracked in:** [`ROADMAP.md`](../../ROADMAP.md) (Backlog) · **Product sections (at ship):** PRD §5/§8,
> TECH §5/§12.1.
>
> This is the **design record** captured in an interactive planning session, the same way the
> [multi-repo-orchestration](multi-repo-orchestration.md) and
> [documentation-pillars](documentation-pillars-R069-074.md) epics were first captured before they
> shipped. It records the problem, the lean/full composition contract, the declarative `when` deploy
> model, and the user-locked decisions the implementation will follow. The authoritative per-item record
> becomes the **Shipped** table in `ROADMAP.md` as each item lands.

## Why

Two gaps in the shipped guideline system motivate this work.

**1. Every guideline deploys unconditionally.** `scaffold` maps every entry of `GUIDELINES`
(`packages/core/src/model/context.ts`) to a target file
(`packages/core/src/scaffold/index.ts:196`), with no stack filtering. A target repo therefore receives
`performance-testing` even with no JMeter in the stack, `multi-repo-boundaries` in a single-repo install,
and `mcp-content-fetch` with no fetch MCP enabled — content it does not need, which costs tokens and adds
noise. The product principle (TECH §11: a lean root map, guidelines pulled just-in-time) argues for the
target carrying **only what its stack and tooling need**.

**2. There is richer guideline material we want, but it is too large to live in-context.** The
gitignored sibling reference folder `.external/guidelines` (~22 files, ~30.8K tokens) holds deeper
standards (diagram rules, assumptions protocol, anti-hallucination checklists, test-data lifecycle,
naming, coding standards, documentation structure, repo exclusions, security/OWASP detection). The user
wants the **compressed essence in the context-loaded guideline** (the *lean* tier) and the **full guide
available in `docs/` without duplication** — cost-effective token-wise and easy to edit per project.

The shipped system already has the pieces to build on: the guideline standard with mandatory ✅/❌
examples and phase-2 placeholders (R-026), the `qa-guidelines` skill that fills those placeholders from
real code (R-089), the `doctor` guideline checks, the conditional-inclusion pattern in
`model/mcp.ts:resultServers`, and the generated-and-snapshot-tested `docs/skill-catalog.md`
(`docs/skill-flows.ts`). This epic composes those patterns rather than inventing new ones.

## The `.external`-is-not-shipped invariant (load-bearing)

`.external/` **is not, and will not become, part of the package.** It is a gitignored sibling reference
folder. Anything needed from it is **copied/adapted into TypeScript strings in
`packages/core/src/model/context.ts`** — exactly how R-044 (`assumptions`) and R-045 (`grounding`) were
adapted. There is **no runtime reference** to `.external`; nothing from it reaches the build output or a
target repo. The implementation must keep `packages/` free of any `.external` import or path.

## Lean / full composition contract

The guideline model gains a single optional field and a composition rule:

- `Guideline` gains `extended?: string`. Today's 14 bodies become the `leanBody` (renaming the field is
  an implementation detail; the existing body text is unchanged). The lean must keep everything `doctor`
  validates: the H1, any contract sentence (for `*:contract`-checked guidelines), the
  `## Examples (✅ good / ❌ bad — required)` section, and the phase-2 `{{PLACEHOLDER}}` slots.
- **The full guide is `leanBody ⊕ extended`** — the full text literally *contains* the lean string, so
  **duplication is impossible by construction** (a fix to the lean shows up in the full guide for free).
- **Only the lean deploys to the target** (loaded into agent context just-in-time when a skill reads it).
  The **full guide is generated into `docs/guidelines/<name>.md`** (in this package's `docs/`, not the
  target) and snapshot-verified — it is author/maintainer reference, never auto-loaded into context.
- The lean carries an **inline-code pointer** to its full guide
  (`docs/guidelines/<name>.md`, rendered as code, **not** a markdown link, so it cannot trip `doctor`'s
  broken-link check — the R-037 repo-map-inventory pattern), and **only when the guideline actually has
  an `extended` section** (no misleading "full version" pointer when lean == full).

Generation mirrors `docs/skill-flows.ts`: a new `packages/core/src/docs/guideline-flows.ts` emits
per-guideline `docs/guidelines/<name>.md` plus a `docs/guidelines/README.md` index, wired into
`npm run docs` (the `WRITE_DOCS=1` wrapper in `scripts/gen-docs.mjs`) and snapshot-verified in a new
`tests/guideline-flows.test.ts`, so un-regenerated drift fails CI.

## Stack-aware deploy — the `when` model

Each guideline declares, declaratively, when it applies:

```ts
when?: {
  frameworks?: string[];   // any detected framework matches
  language?: string[];     // node | java | python
  performance?: string[];  // e.g. "jmeter"
  security?: string[];     // e.g. "zap"
  mcp?: string[];          // a fetch/ticketing MCP is enabled
  multiRepo?: boolean;     // a workspace block exists
  web?: boolean;           // app under test is web (future dimension)
};
```

Absent `when` ⇒ **universal** (always deployed). `scaffold` evaluates `when` against the detected
`stack`, the wizard `choices`, and the `workspace` block — the same inputs `model/mcp.ts:resultServers`
already switches on. The evaluated set is **recorded in the manifest** as
`manifest.choices.guidelines`, the source of truth for downstream commands.

**Wizard override (R-092).** `when` pre-selects the default set; the interactive wizard lets the user
add or remove guidelines; the final set persists to `manifest.choices.guidelines`. `--yes` / CI uses the
pure `when` result (deterministic). `update` re-renders from the recorded set — never from a fresh `when`
evaluation — exactly as it re-derives `DEVELOPER_REPOS` / `MULTI_REPO_RULE` from the `workspace` block
(R-088), so a migration is byte-identical to the live scaffold and never silently strips a guideline the
user kept.

**`doctor`.** A new check verifies the on-disk guideline set matches `manifest.choices.guidelines`; the
fixed structure check becomes manifest-driven for guideline files. `GUIDELINE:examples` and
`GUIDELINE:unfilled` continue to validate each deployed lean.

## Backward-compatibility note (conscious byte-identical break)

Today all 14 guidelines deploy on every scaffold. Of these, **11 are universal process standards** and
stay universal: `qa-conventions`, `grounding`, `assumptions`, `test-naming`, `diagram-conventions`,
`documentation`, `documentation-as-code`, `spec-driven-development`, `environment-management`,
`test-data-management`, `code-formatting`.

**3 are conditional by nature** and gain a `when`:

- `performance-testing` → `when: { performance: ["jmeter"] }`
- `mcp-content-fetch` → `when: { mcp: [...] }` (a fetch MCP is enabled)
- `multi-repo-boundaries` → `when: { multiRepo: true }`

Making these conditional **drops them from a default single-repo / no-JMeter / no-fetch scaffold**, which
breaks the byte-identical invariant the multi-repo epic preserved. This is a **conscious, one-time
change**: migrate the parity test (`tests/scaffold.test.ts`), the `doctor` structure checks, and the
generated snapshots, and bump the package version with a changelog note. `update` on an existing repo
**never deletes** — a guideline that no longer matches becomes a reported `orphan`, not a deletion — so
no installed repo loses content silently. R-090 alone (the `extended` tier + generator) keeps the lean
byte-identical; the break lands only with R-091.

## Locked decisions (session)

1. **Architecture (T1):** single-source; full content authored once in `core`; only the lean deploys;
   full = `leanBody ⊕ extended` generated into `docs/guidelines/`, snapshot-tested. Mechanism:
   **composition** — `Guideline.extended?`, today's bodies become `leanBody`.
2. **Stack-aware deploy (T2):** declarative `Guideline.when`; absent ⇒ universal; auto-select +
   interactive wizard override recorded in `manifest.choices.guidelines`; `--yes`/CI pure `when`;
   `update` re-renders from the recorded set. `when` on the 3 naturally-conditional guidelines + all new
   ones; 11 stay universal; conscious byte-identical break with test/snapshot migration + bump; `update`
   never deletes.
3. **Scope (T3):** enrich the `extended` tier for **8** guidelines with real `.external` source; add a
   new **lean** `security-testing` (`when: security`) now, its rich review/SAST `extended` deferred to
   R-055; defer `ai-rules` meta, `accessibility-testing` content (→ R-057), and the workflow guides
   (→ R-076/R-077/R-078).
4. **Maintenance (T4):** new `docs/guideline-flows.ts` generator → per-guideline files + index, wired to
   `npm run docs`, snapshot-tested; lean→full inline-code pointer only when `extended` exists; new
   `doctor` set-consistency check; `GUIDELINE:examples`/`unfilled` unchanged; per-project editing stays
   with `qa-guidelines` (R-089) filling the deployed (now filtered) lean files.
5. **ROADMAP + artifacts (T5):** 4 items R-090 → R-093 (foundation → deploy → wizard override →
   enrichment + lean security-testing); artifacts = this design record + a `ROADMAP.md` update; PRD/TECH
   updated at ship per repo convention.

## Epic decomposition

```text
R-090  extended tier + docs/guidelines/ generator        (foundation, no deps)
  └─ R-091  stack-aware deploy via Guideline.when         (depends R-090)
       └─ R-092  interactive guideline-set override        (depends R-091)
  └─ R-093  enrichment (8 extended) + lean security-testing (depends R-090, R-091)
```

- **R-090** — Guideline `extended` tier + `docs/guidelines/` generator. Adds the field, the generator,
  the index, the snapshot test, the `npm run docs` wiring, and the inline-code pointer. **Zero deploy
  change** (lean byte-identical) → parity safe.
- **R-091** — Stack-aware deploy via `Guideline.when`. Evaluator in `scaffold`, manifest record, `doctor`
  set-consistency check, `update` awareness; applies `when` to the 3 conditional guidelines; the
  conscious byte-identical break + migration + bump.
- **R-092** — Interactive guideline-set override in the wizard, persisted to the manifest, honored by
  `update`.
- **R-093** — Author `extended` for the 8 guidelines from adapted `.external` content; add the new lean
  `security-testing` (`when: security`, DAST/ZAP essence + ✅/❌ + placeholders, `doctor` examples). Rich
  review/SAST `extended` for `security-testing` is deferred to R-055.

## Patterns reused

- Generator + snapshot: `docs/skill-flows.ts`, `tests/skill-flows.test.ts`, `scripts/gen-docs.mjs`, root
  `package.json` `docs` script.
- Conditional inclusion: `model/mcp.ts:resultServers` (framework switch + `performance?.includes` /
  `observability?.includes`).
- Inline-code paths (not links) to avoid broken-link findings: R-037
  (`detect/repo-map.ts:renderDeveloperRepos`).
- Manifest-recorded choice re-derived by `update`: `DEVELOPER_REPOS` / `MULTI_REPO_RULE` (R-088).
- Guideline standard + `doctor` checks: `GUIDELINE:examples`, `GUIDELINE:unfilled`, the `*:contract`
  checks.
- `.external` adaptation precedent: R-044 / R-045 copied content into `context.ts`.

## Appendix — `.external` source-extraction map

What to copy from `.external` and where it lands in `core`. This drives R-093 (and the deferred
pointers). `.external` itself ships nowhere.

| `.external` file(s) | Disposition | Target in `core` |
|---|---|---|
| `diagram-standards.md` + `.github/instructions/diagram-rules.instructions.md` | enrich | `diagram-conventions.extended` — `classDef` ban, theme-safe palette, formatter pins, node verification |
| `assumptions-rules.md` + `.copilot-instructions/assumptions-template.md` + `.github/instructions/assumptions-protocol.instructions.md` | enrich | `assumptions.extended` — expanded template, confidence calibration, scenarios |
| `.copilot-instructions/anti-hallucination-checklist.md` + `.github/instructions/anti-hallucination.instructions.md` + `.copilot-instructions/verification-steps.md` | enrich | `grounding.extended` — pre/post checklists, source-of-truth hierarchy, red flags |
| `test-data-management.md` | enrich | `test-data-management.extended` — factory/builder, isolation, cleanup |
| `naming-convention.md` | enrich | `test-naming.extended` — generalized class/method name patterns |
| `coding-standards.md` + `.github/instructions/coding-conventions.instructions.md` | enrich | `qa-conventions.extended` — test structure, assertions, base-class (generic parts only) |
| `project-documentation.md` + `.github/instructions/documentation-standards.instructions.md` | enrich | `documentation` / `documentation-as-code.extended` — doc hierarchy, front-matter, citation forms |
| `.github/instructions/excluded-repos.instructions.md` | enrich | `multi-repo-boundaries.extended` — generalized exclusion patterns |
| `security-rules.md` | new (lean now, extended deferred) | new `security-testing` lean; rich review/SAST `extended` → R-055 |
| `ai-rules.md` | defer | ROADMAP pointer — response-size / pattern-first meta (unscheduled) |
| `business/service-analysis.md` + `business/service-analysis-updates.md` | defer | skill procedures → R-078 |
| `business/solution-overview.md` | defer | `qa-reverse-engineer` (C4 L1) |
| `business/jira-ticket-refinement.md` + `.github/instructions/jira-refinement.instructions.md` | defer | `qa-ticket-review` (already R-066) |
| `business/README.md` | skip | navigation only |
