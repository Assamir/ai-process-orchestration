# ADR 0001 — Embedded test topology (test framework inside a developer repo)

- **Status:** Accepted — shipped as epic R-095 → R-099 (v0.66.0–v0.70.0)
- **Date:** 2026-07-01
- **Deciders:** QA-orchestration maintainer (interactive planning session)
- **Design record:** [`../embedded-test-topology.md`](../embedded-test-topology.md)
- **Usage guide:** [`../../embedded-tests.md`](../../embedded-tests.md)

> First ADR in this repo. Epic-level design normally lives in `docs/design/<epic>.md`; this ADR captures
> the **single load-bearing architectural choice** — reuse the multi-repo machinery for a *partially*
> writable host — separately, because it commits us to a semantic overload of `WorkspaceInfo` that future
> maintainers should be able to find and revisit in one place. Per-decision detail (D1–D7) stays in the
> design record.

## Context

The scaffolder recognizes two repository topologies: **single-repo** (scan root = write root) and
**multi-repo** (R-083 → R-094: a parent with a dedicated **test repo** + read-only **developer repos**).
Neither models a third, common layout: the test framework has **no repo of its own** and lives as a
**subtree** (an `e2e/` folder or a build module) **inside one of the developer repos**. The writable area
is therefore a *subtree* of a repo that, as a whole, is developer source — something the multi-repo model
explicitly cannot express, since it marks a whole dev repo read-only.

Two variants are in scope: **single-host** (one app repo with an embedded test subtree, no siblings) and
**multi-host** (a parent where one dev repo hosts the test subtree, others are read-only source).

Constraints: (1) the backward-compatibility invariant — existing single/multi scaffolds and the parity
test must stay byte-identical; (2) phase-1 stays deterministic, no LLM; (3) functional parity between the
Claude and Copilot packages; (4) `update` never clobbers user edits.

## Decision

**Model the embedded topology by extending the existing `WorkspaceInfo` with an optional `testSubpath`,
reusing the multi-repo guardrail, `doctor`, and `update` machinery — rather than introducing a parallel
type or an explicit topology discriminator.**

- `testSubpath` (POSIX-relative, e.g. `"e2e"`) names the writable test subtree inside the host repo.
  `testRepo` is the host repo name (multi-host) or `"."` (single-host); `devRepos` are read-only siblings.
- The writable set `W` = orchestration config at the host root **∪** `host/{testSubpath}/**`; everything
  else (host application source + other dev repos) is read-only.
- Three enforcement layers: a lean root-config rule (embedded branch of `renderMultiRepoRule`), the
  extended `multi-repo-boundaries` guideline, and a `doctor` leak-check.
- Editor guardrail: single-host via `.vscode/settings.json` (`readonlyInclude` + `readonlyExclude`
  carve-out, shallow-merged); multi-host via the existing `.code-workspace` with a `readonlyExclude`.
- Detection is a full hybrid (`enumerateTestSubtrees`/`chooseTestSubtree` + wizard proposal + flags), and
  **`--yes`/CI without `--test-subpath` never activates embedded mode**. Multi-host precedence: a dedicated
  test-repo wins; embedded is the fallback; `--test-host`/`--test-subpath` override.

## Consequences

**Positive**

- Minimal new surface: one optional field, conditional branches — no duplicated workspace/render/doctor
  machinery, no second code path to keep at parity.
- Backward-compatible: absent `testSubpath` ⇒ today's behavior; new render vars collapse to `""`.
- Consistent defense-in-depth and re-run model with the multi-repo epic.

**Negative / trade-offs**

- `testRepo` is **semantically overloaded** (a dedicated repo vs. the host / `"."`). Mitigated by type
  documentation and `doctor` validation, but it is a real cognitive cost.
- `settings.json` is produced by a shallow **merge**, so `update` can only report drift there, not refresh
  it (no per-key baseline yet).
- The `multi-repo-boundaries` guideline name is inaccurate for single-host (no "multi repo"). Accepted for
  now; a neutral rename to `workspace-boundaries` is deferred to a separate backlog item to keep this
  epic's diff migration-safe.

## Considered alternatives

- **Separate `EmbeddedTestInfo` type + parallel code paths** — cleaner separation, but duplicates the
  workspace/render/doctor/update machinery and doubles parity/snapshot maintenance.
- **Explicit `layout: "single" | "multi-repo" | "embedded"` discriminator** — most self-documenting, but a
  larger refactor of every topology branch plus a manifest migration. Deferred as a possible future cleanup
  if a fourth topology appears.
- **Generalize `writeRoot` to any subtree, no new field** — smallest model change, but conflicts with the
  decision to keep orchestration config at the host root and still needs a separate read-only expression.
