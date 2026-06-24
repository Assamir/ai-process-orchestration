# Plan: Runtime-artifact integrity epic (R-059 → R-061)

> **PROGRESS (2026-06-23): R-059 ✅ SHIPPED (v0.39.0).** Artifact template registry
> (`packages/core/src/model/artifacts.ts`, `ARTIFACTS` + `tpl()`), 6 producing skills
> compose from it via a fenced `## Template`, trace markers `AC<n>`/`Traces to:`/`Covers:`
> + seeded `status: in-progress`, `tests/artifacts.test.ts` + scaffold consistency
> assertion, all 167 core tests green, no doc drift, leaves bumped to 0.39.0. ROADMAP
> Shipped-row commit hash recorded (`6eb9e27`). **Next: R-060.**
>
> **CHECKPOINT (2026-06-23) — plan complete, all forks resolved.**
> To resume: open this file, enter plan mode, start from **R-060**.
>
> **Decisions locked by the user:**
> - Goals: enforcement (validator) + shape consistency + analysis durability. Quality rubric — dropped.
> - Analyses persist as files (all 5: rca/coverage/review/ticket-review/metrics).
> - Validator: extends `doctor` + a `status:` frontmatter (in-progress=warn, ready/done=error).
> - Analysis allowlist: flip read-only→write (precedent: `qa-reverse-engineer`); `qa-gardening` stays read-only.
> - R-059 registry: scope is `changes/<id>/*` only.
> - Status lifecycle: **qa-review: in-progress→ready; qa-archive: →done** (consistent with the backbone).
> - Versioning: **3 separate minors** 0.39.0 / 0.40.0 / 0.41.0 (one R-### per shippable).
> - The next roadmap IDs are free (last shipped R-058); R-059/060/061 do not collide.

## Context

Session goal (as restated by the user): **consistent, high quality of the artifacts
delivered by the QA orchestration**, supporting the whole test process.

A code review (3 probes over `packages/core/src/model/{skills,context}.ts`,
`scaffold/index.ts`, `doctor/index.ts`, tests) revealed the product splits into two
consistency layers:

1. **Skeleton** (`context/foundation`, `reference`, guidelines, root config) — shape is
   *seeded* in `FOUNDATION`/`GUIDELINES`, and quality is **enforced deterministically** by
   `doctor` (structure, links, placeholders, guideline contracts, the iron rule as *text*
   in the root config). Wired into CI as a gate (R-051).
2. **Runtime artifacts** (`context/changes/<id>/{work,plan,cases,automation,performance,
   bug-report}.md` + analyses) — shape is **prose in the skill bodies**, and quality is
   policed **only by that prose + the advisory `qa-gardening`** (LLM, non-deterministic,
   never blocks).

Three gaps this change closes (chosen by the user; the quality rubric is deliberately
dropped):

- **No single source of runtime-artifact shape** — templates are not lifted into a
  registry (like `GUIDELINES`/`FOUNDATION`), so any validator would duplicate the definition.
- **The most valuable analyses vanish into chat** — `qa-rca`, `qa-coverage-gap`, `qa-review`,
  `qa-ticket-review`, `qa-metrics` are read-only and **write nothing**. No auditable trail
  (RCA, coverage, go/no-go).
- **The iron QA rule is not enforced on the artifacts** — it is checked only as *text in
  the root config*, never as a property of a real `cases.md`/tests (AC↔case↔test trace).

**Enforcement scope (honest calibration):** the deterministic validator guarantees a
**consistent shape + complete traces**, *not* semantic correctness of the content.
Substantive judgement stays with `qa-gardening` (advisory). This is a conscious non-goal.

Everything is in **English** (code, identifiers, PRD/TECH/ROADMAP) — per the `packages/`
convention. The chain has a hard dependency order: **R-059 → R-060, R-059 → R-061** (the
registry is the foundation of both the validator and persistence).

---

## R-059 — Artifact template registry (single source of shape) — `v0.39.0`

**Goal:** lift the shape of the `context/changes/<id>/*` artifacts into one registry,
analogous to `GUIDELINES`/`FOUNDATION`, with **parseable trace markers** — the foundation
for R-060 and R-061. Scope: `changes/<id>/*` only (foundation/reference already have a
seeded template and are checked by doctor).

**New file:** `packages/core/src/model/artifacts.ts`

```ts
export interface ArtifactTemplate {
  name: string;            // e.g. "cases"
  pathTemplate: string;    // "context/changes/<work-id>/cases.md"
  producedBy: string;      // skill name (must exist in SKILLS)
  requiredSections: string[]; // headers the validator requires
  traceField?: string;     // e.g. "Traces to" (for cases.md → AC)
  template: string;        // canonical, seeded body
}
export const ARTIFACTS: ArtifactTemplate[] = [ /* work, plan, cases, automation,
   performance, bug-report — extracted from today's skill bodies */ ];
```

**Trace markers (parseable, stable):**
- `work.md` — every acceptance criterion as a stable id: `- **AC1**: …` (regex `AC\d+`).
  **Plus** frontmatter `status:` (see R-061) — `in-progress` at the start.
- `cases.md` — every case carries a `Traces to: AC1[, AC2]` field (today prose "the
  criterion it traces to"; to be formalized).
- `automation.md` — every test references its case: `Covers: TC1`.

**Changes in `model/skills.ts`:** the skill bodies that today describe the template in prose
**compose it from the registry** (string interpolation: `body: \`…procedure… ${tpl("cases")} …\``),
so the body text stays *identical for both adapters* (the parity test does not break) and the
shape is single-sourced. Applies to: `qa-new`, `qa-plan`, `qa-test-case-design`,
`qa-test-automate`, `qa-performance`, `qa-bug-report`.

**Reuse of existing machinery:** `LogicalSkill.writes: string[]` (already machine-readable
artifact paths with the `<work-id>` token) — `ArtifactTemplate.pathTemplate` must match them;
add an `ARTIFACTS ↔ SKILLS.writes` consistency assertion in the test.

**Tests:** new `tests/artifacts.test.ts` — registry snapshot + assertions that every
`producedBy` exists in `SKILLS`, every `pathTemplate` appears in the matching skill's `writes`,
and every template contains its `requiredSections`. Check that the `skill-flows.ts` generator
(which parses the body) still works and the `docs/skill-catalog.md` snapshot matches
(`WRITE_DOCS=1` regen).

**Critical files:** `model/artifacts.ts` (new), `model/skills.ts`, `tests/artifacts.test.ts`
(new), `tests/scaffold.test.ts` (consistency assertion), ROADMAP/PRD §5/§8/TECH §11–§12.

---

## R-060 — Persist analysis artifacts — `v0.40.0` (depends on R-059)

**Goal:** the read-only "judges" write a versioned artifact instead of only chat — process
auditability. User's choice: **flip to write** (precedent: `qa-reverse-engineer` reads code,
is `write` because it writes docs).

**Flip `readOnly: true → false`** for: `qa-rca`, `qa-coverage-gap`, `qa-review`,
`qa-ticket-review`, `qa-metrics`. **`qa-gardening` stays read-only** (a meta-sweep over
`context/`, not an artifact producer).

**New artifacts (shape from the R-059 registry):**
- work-item-scoped → `context/changes/<id>/`: `rca.md`, `coverage.md`, `review.md`,
  `ticket-review.md`.
- cross-cutting → **new** `context/reports/`: `metrics-<YYYY-MM-DD>.md` (qa-metrics is
  above the work-item level). Add `context/reports/.gitkeep` to the scaffold + a "Where things
  live" legend in the root config.

**Consequences to handle:**
- Allowlist: Claude `+Write,Edit,Bash`; Copilot `+editFiles,runCommands` — rendered
  automatically from `readOnly`. The **parity test** asserts the allowlists → update it.
- Root-config buckets mark read-only skills `*(read-only)*` — these skills drop the marker;
  update the test expectations.
- `model/skills.ts`: add the paths to `writes`, add a "write the report to `<path>`" step to
  the procedure + `## Next`; extend `ARTIFACTS` (R-059) with `rca/coverage/review/
  ticket-review/metrics`.
- `qa-gardening`/`qa-archive` can now read these reports (consistent with the existing flow).

**Critical files:** `model/skills.ts`, `model/artifacts.ts`, `model/context.ts` (root-config
legend + `context/reports/`), `scaffold/index.ts` (.gitkeep), `tests/scaffold.test.ts`
(allowlists + read-only bucket), `tests/artifacts.test.ts`, ROADMAP/PRD §5/TECH §5.

---

## R-061 — Artifact validator in `doctor` (+ status gating) — `v0.41.0` (depends on R-059)

**Goal:** make the iron QA rule a *check on real files*, not just text. User's choice:
**extend `doctor`** (already the CI gate from R-051) + a **`status:`** frontmatter field so
work in progress is not blocked.

**New function:** `validateWorkItems(root, adapter)` in `doctor/index.ts`, wired into
`runDoctor` (so the R-051 CI gate catches it automatically). Safe by default: no
`context/changes/*` → no findings (a fresh scaffold has only `.gitkeep`).

**Status gating** (from `work.md` frontmatter `status:`):
- `in-progress` → **warn** or skip (work in flight is incomplete by definition).
- `ready` / `done` → **error** on gaps (the full gate).
- `context/archive/<id>/` → read-only history → **warn** at most, never blocks.

**`status:` lifecycle** (locked): `qa-new` creates `in-progress`; **`qa-review` moves it
`in-progress → ready`** (submits to the hard gate); **`qa-archive` → `done`** when moving to
`archive/`. The doctor gate enforces hard only from `ready`. This requires adding a "set
status:" step to the `qa-review`/`qa-archive` procedures (R-060/R-061 touch these skills, so
it is consistent).

**Checks (stable, deterministic ids):**
- `WORKITEM:<id>:missing:<artifact>` — an expected artifact (from `SKILLS.writes` /
  `ARTIFACTS`) does not exist for a `ready`/`done` item. *(error)*
- `WORKITEM:<id>:section:<artifact>:<header>` — a required section is missing
  (`ArtifactTemplate.requiredSections`). *(error)*
- `WORKITEM:<id>:uncovered:<AC>` — an AC from `work.md` has no case with `Traces to: <AC>`
  (the iron rule!). *(error)*
- `WORKITEM:<id>:untraced-case:<TC>` — a case with no `Traces to`. *(warn)*
- `WORKITEM:<id>:orphan-case:<TC>` — a case covered by no `Covers:` in automation.
  *(warn)*
- `WORKITEM:<id>:status` — missing/invalid `status:`. *(warn)*

**Trace parsing** uses the R-059 markers (regexes `AC\d+`, `Traces to:`, `Covers:`) —
*this is why R-059 is a prerequisite*.

**Tests:** extend `tests/doctor.test.ts` with work-item fixtures: (a) `in-progress` with
gaps → no errors; (b) `ready` with an uncovered AC → error `WORKITEM:*:uncovered`;
(c) `ready` complete → clean; (d) incomplete archive → warn only. Assert that an empty
`changes/` produces no findings.

**Critical files:** `doctor/index.ts` (`validateWorkItems`), `model/artifacts.ts` (import
`requiredSections`/`traceField`), `tests/doctor.test.ts`, `cli.ts` (if a scope flag is
needed), ROADMAP/PRD §8/TECH §11.

---

## Verification (end-to-end)

```powershell
npm install
npm run typecheck
npm test            # core: artifacts (new) + scaffold/parity + doctor + skill-flows
npm run build
npm run docs        # regen docs/skill-catalog.md if the skill bodies changed

# Manual smoke on a fresh target:
node packages/claude-qa-orchestrator/dist/index.js init --root <tmp> --yes
node packages/claude-qa-orchestrator/dist/index.js doctor --root <tmp>   # clean: empty changes/

# R-061: simulate a 'ready' work-item with an uncovered AC → doctor returns WORKITEM:*:uncovered (exit≠0)
# R-060: run qa-rca in the tool → context/changes/<id>/rca.md is produced
```

Definition of "done" per item (ROADMAP convention): code + tests (incl. parity) green,
ROADMAP flipped to ✅ with version+commit, package version bump, PRD/TECH updated;
`doctor` clean before ship.

## Conscious non-goals
- Validating the **semantic** correctness of content (whether an RCA is right) — stays with
  `qa-gardening` (advisory).
- A registry of **all** artifacts (foundation/reference) — out of the starting scope.
- A quality rubric/score (option 4 from the session) — deliberately dropped.
