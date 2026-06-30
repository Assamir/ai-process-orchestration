<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Spec-driven development

> Phase 1 seeded this standard. Phase 2 records this project's spec workflow in the `{{PLACEHOLDER}}` section.

A documented spec — acceptance criteria, expected behavior, edge conditions — comes **before** case design, automation, and code. This is the iron QA rule read from the authoring direction: the iron rule says every test traces *back* to an acceptance criterion; spec-driven development says that criterion must exist and be agreed *first*, so there is something to trace to. No spec ⇒ no cases ⇒ no automation. A test written before its criterion is recorded has nothing to anchor it — it ends up mirroring the implementation instead of the intended behavior.

## Rules
- **Spec precedes design.** Capture the acceptance criteria in `context/changes/<id>/work.md` (via `qa-new` / `qa-ticket-review`) before deriving cases. If the criteria are ambiguous or missing, that is a blocker to resolve — surface it, don't guess your way past it.
- **Cases derive from the spec, not the code.** Every case in `cases.md` names the criterion it covers. A case tracing to no criterion is either an undocumented requirement (write the spec) or scope creep (drop it).
- **Each criterion is testable when written.** "Works correctly" is not a criterion; "returns 429 when the rate limit is exceeded" is. `qa-ticket-review` marks each criterion testable / not-yet-testable; sharpen the not-yet-testable ones before design starts.
- **Spec changes ripple forward, in order:** update `work.md` first, then cases, then automation. Never patch a test to match new behavior while the criterion still describes the old behavior.
- This composes with `grounding` (cite the spec text a criterion derives from) and reinforces, never weakens, the iron QA rule.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the criterion is written and agreed first, then the case traces to it:
```
work.md   AC-3.1 "API returns 429 once a client exceeds 100 requests/min"
cases.md  TC-12  "returns 429 when rate limit exceeded"  -> traces AC-3.1
test      limit.spec.ts implements TC-12
```

❌ **Avoid** — a test written first, with the "spec" reverse-engineered from the code afterwards:
```
test      "rate limit works"  (asserts whatever limiter.ts currently does)
work.md   (no acceptance criterion) -> nothing to trace to; mirrors the implementation
```

## Applicable patterns

> Encouraged: the spec-first practices this project applies (Specification by Example,
> Given-When-Then acceptance criteria, BDD `.feature` files, ticket-as-spec) so agents follow the flow.

{{SPEC_DRIVEN_PATTERNS}}

## Project-specific spec workflow

> Record where this project's specs live and how they are agreed (ticket system, Confluence space, `.feature` files, the definition-of-ready) so agents read the spec before designing.

{{PROJECT_SPEC_WORKFLOW}}
