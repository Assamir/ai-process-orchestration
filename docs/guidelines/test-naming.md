<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Test naming

> Phase 1 seeded this for **{{PROJECT_LANGUAGE}}** / **{{AUTOMATION_FRAMEWORK}}**.
> Phase 2 refines the `{{PLACEHOLDER}}` sections.

## Conventions

- Test names state the behavior and expected outcome, e.g. `returns 429 when rate limit exceeded`.
- Case ids are stable and traceable to an acceptance criterion (e.g. `AC-3.1`).
- Files/specs mirror the feature under test, one feature area per file.

{{NAMING_RULES}}

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — states behavior + outcome, traceable to an AC:
- `returns 429 when rate limit exceeded` → AC-3.1
- `rejects checkout when the cart is empty` → AC-7.2

❌ **Avoid** — vague, numbered, or implementation-mirroring names:
- `test1`, `testLogin`, `it("works")`
- `calls validateCart() then setStatus()` (mirrors the code, not the behavior)

## Examples from this codebase

> Add a few real names from this codebase so agents copy the right pattern.

{{NAMING_EXAMPLES}}

## Applicable patterns

> Encouraged: naming patterns this codebase uses (e.g. Given-When-Then, "should…",
> one-feature-area-per-file) so agents copy the right shape.

{{NAMING_PATTERNS}}

## Extended — naming patterns by element

> Maintainer reference (generalized from the naming-convention source — the originals are JVM-specific;
> apply the *shape*, not the exact casing, to your stack). The lean tier above is the deployed contract.

| Element | Pattern | Example |
|---|---|---|
| **Test class / suite** | `<FeatureOrEndpoint>Test` / `<feature>.spec` — names the unit under test, not "Tests1" | `CheckoutRateLimitTest`, `checkout-rate-limit.spec.ts` |
| **Test method / case** | states *behavior + condition + outcome*; verb-led, no `test` prefix noise | `returns429WhenRateLimitExceeded`, `rejects checkout when cart is empty` |
| **Test-data variable** | describes the *role*, not the type | `expiredCard`, `adminUser` — not `obj`, `data2` |
| **Constant** | `UPPER_SNAKE` for fixed values, grouped by domain | `MAX_RETRIES`, `DEFAULT_CURRENCY` |
| **Schema / model** | mirrors the contract entity | `CheckoutRequest`, `OrderResponse` |
| **Package / folder** | mirrors the feature area, one area per folder | `tests/checkout/`, `tests/auth/` |

### Rules behind the table
- **The name is the spec.** A reader who sees only the test name should know what behavior is verified and
  under what condition — that is what makes a failing test report self-explanatory.
- **Don't mirror the implementation.** `callsValidateThenSetStatus` couples the name to today's code;
  `rejectsExpiredCard` couples it to the behavior, which is what the AC promised. Composes with
  `spec-driven-development` (the name traces to the criterion, not the call graph).
- **One feature area per file**, so a change touches one place and the suite stays navigable.
- **Stable case ids** (`AC-3.1` → `TC-12`) survive renames and carry the traceability the iron QA rule needs.

### ✅ / ❌
- ✅ `returns 404 when the order id is unknown` → traces `AC-2.4`
- ❌ `test1`, `testCheckout`, `it("works")`, `verifyOrderServiceLogicPath`
