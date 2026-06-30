<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Assumptions protocol

> Phase 1 seeded this standard. Phase 2 records this project's assumption workflow in the `{{PLACEHOLDER}}` section.

The `grounding` rule says cite a real artifact for every claim. This guideline covers the other half: what to do when you *must* infer something you cannot yet cite. Inference is **allowed only** inside an explicit `## Assumptions` table, where each row carries its basis, impact, a way to verify it, and a calibrated confidence — so the reader can accept, challenge, or verify it. Any inferred content **outside** the table is treated as a hallucination, exactly as the `grounding` rule treats an uncited claim. This legalizes the unavoidable guess by making it visible and checkable, instead of letting it masquerade as fact.

## The Assumptions table

Every document or report that contains any inferred claim MUST include a `## Assumptions` table:

```markdown
## Assumptions

| ID | Claim | Basis | Impact | Verification | Confidence |
|----|-------|-------|--------|--------------|------------|
| A1 | partnerKey follows a "COUNTRY-BRAND" format | `ServiceImpl.java:44` calls `extractValuesFromKey(partnerKey).get("country")` | Test-data shape; invalid format ⇒ failing integration tests | Read `extractValuesFromKey` impl; ask the dev team for the validation rule | medium |
```

### Column rules

| Column | Required content |
|---|---|
| **ID** | `A1`, `A2`, … sequential per document. |
| **Claim** | One sentence stating exactly what is being assumed. |
| **Basis** | Concrete evidence (`file:line`, MCP source, user quote) that *suggested* the inference. **Never** "common practice" / "typical pattern" / "usually" — those are red flags, not a basis. |
| **Impact** | The downstream decision that depends on this assumption (what breaks if it's wrong). |
| **Verification** | A specific action — a file to read, a command to run, a person to ask — that would confirm or refute it. |
| **Confidence** | `low` / `medium` / `high`, calibrated (see below), not optimistic. |

## Confidence calibration

| Confidence | Meaning |
|---|---|
| **high** | A single missing fact, strongly implied by the surrounding evidence; verification would take under five minutes. |
| **medium** | Several plausible readings; you chose one with documented reasoning. |
| **low** | Speculative; the work proceeds but the reader is warned. |

If you would mark **high** for half your rows or more, recalibrate — **high confidence is rare**.

## Reference convention

When the body relies on an assumption, cite it inline as `(A1)` so the assumption and its use stay linked:

```markdown
The lead service exposes a bulk endpoint (A1) the ticket must extend with retry logic (A3).
```

Every inline `(An)` must resolve to a row in the table, and every row should be referenced at least once.

## When NOT to use an assumption

The table legalizes *grounded inference*, not laundering. Do **not** use it for:
- A pure guess with no basis → write `[Required input — not provided]` and stop, don't invent a basis.
- Something the user actually told you → cite the user, it is not an assumption.
- Something already in a workspace file → cite `file:line`, it is a fact, not an assumption.
- Conflicting sources → write `[Conflicting sources: A says X, B says Y]`, don't silently pick one.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the inference is in the table with a concrete basis and a calibrated confidence, and the body references it:
```markdown
Auth is delegated to the gateway (A2), so the service has no login test surface.

## Assumptions
| ID | Claim | Basis | Impact | Verification | Confidence |
|----|-------|-------|--------|--------------|------------|
| A2 | The service delegates auth to the API gateway | No `SecurityConfig` and no `@PreAuthorize` in `src/main/java` | No auth cases needed for this service | Check the gateway config; ask DevOps | medium |
```

❌ **Avoid** — an unmarked inference stated as fact, justified by "common practice", no way to verify:
```markdown
The service uses a 30-second timeout (Spring's default) and authenticates via the gateway.
```

## Applicable patterns

> Encouraged: the assumption practices this project relies on (a single `## Assumptions` table per report,
> `(An)` inline references, a review step that rejects uncited inference) so agents follow them.

{{ASSUMPTIONS_PATTERNS}}

## Project-specific assumptions workflow

> Record where this project tracks assumptions and how they're validated (the doc/section assumptions live in, who signs off on a `high`, how a refuted assumption is retired) once known.

{{PROJECT_ASSUMPTIONS_WORKFLOW}}

## Extended — zero-tolerance protocol

> Maintainer reference (adapted from the assumptions-rules source). The lean tier above is the deployed
> contract. Not loaded into agent context.

### The golden rule
**Zero tolerance for undocumented assumptions.** Any claim not directly readable from a workspace artifact
is an assumption, and every assumption is either documented in the `## Assumptions` table or removed.
There is no third option — an undocumented inference stated as fact is a defect, not a stylistic choice.

### What counts as an assumption
- A data format, range, or unit you inferred rather than read.
- A behavior "implied" by a name (`partnerKey` → "COUNTRY-BRAND format") but not confirmed in code.
- An integration, ownership, or dependency you concluded from indirect evidence.
- A default value, timeout, or limit you "know" from the framework rather than from this project's config.

### Worked example (the table in use)
```markdown
## Assumptions
| ID | Claim | Basis | Impact | Verification | Confidence |
|----|-------|-------|--------|--------------|------------|
| A1 | partnerKey follows a "COUNTRY-BRAND" format | ServiceImpl.java:44 calls extractValuesFromKey(partnerKey).get("country") | Test data shape; an invalid key fails integration tests | Read extractValuesFromKey; ask the dev team for the validation regex | medium |
```
The body then references it: "The lookup keys on country (A1)."

### Common scenarios that REQUIRE a row
- Reverse-engineering a service whose spec is incomplete.
- Designing cases for an acceptance criterion that is ambiguous.
- Root-causing a failure where the intended behavior isn't written down.
- Generating test data whose valid/invalid boundaries aren't specified.

### Consequences of skipping it
An undocumented assumption that turns out wrong silently poisons everything downstream — cases trace to a
requirement that doesn't exist, automation asserts behavior the system never promised, a refinement
recommends work that isn't needed. The table is cheap; the silent wrong guess is expensive. **High
confidence is rare** — if half your rows are `high`, recalibrate.
