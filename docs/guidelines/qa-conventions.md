<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# QA conventions

> Phase 1 seeded this from the wizard. Phase 2 refines the `{{PLACEHOLDER}}` sections.

- **Automation framework:** {{AUTOMATION_FRAMEWORK}}
- **Static checks:** {{LINTERS}}

## Rules

{{QA_CONVENTIONS}}

## Test quality (non-negotiable)

- One behavior per test; deterministic, independent, parallel-safe — no sleeps.
- Cover negative and boundary cases, not just the happy path.
- Assert intended behavior, not a mirror of the implementation.
- Capture diagnostics on failure (trace/screenshot/log) at the paths recorded in `context/foundation/tools.md`.

## Project-specific conventions

> Record only non-obvious, project-specific rules an agent would otherwise get wrong.

{{PROJECT_SPECIFIC_CONVENTIONS}}

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it. Keep these short and real to this codebase.

✅ **Good** — one behavior, deterministic, waits on a condition, traces to an AC:
```
test("returns 429 when the rate limit is exceeded", async () => {
  await sendRequests(limit + 1);
  await expect(lastResponse).toHaveStatus(429); // AC-3.1
});
```

❌ **Avoid** — two behaviors, a fixed sleep, order-dependent state:
```
test("rate limit", async () => {
  await sleep(2000);          // flaky: races the limiter
  expect(res.status).toBe(429);
  expect(user.isLoggedIn);    // unrelated second assertion
});
```

## Applicable patterns

> Encouraged: name the design / programming / testing patterns this codebase applies
> (e.g. Page Object, Arrange-Act-Assert, Builder for test data) so agents follow them.

{{CONVENTIONS_PATTERNS}}

## Extended — test code conventions

> Maintainer reference (generalized from the coding-standards source — generic parts only; the original is
> RestAssured/JUnit-specific). The lean tier above is the deployed contract.

### Test structure
- **One behavior per test.** A test name maps to a single acceptance criterion; if you need "and" in the
  name, split it. Arrange / act / assert reads top-to-bottom even when you don't enforce AAA blocks.
- **Independent & parallel-safe.** No shared mutable state between tests, no reliance on execution order,
  no fixed `sleep` — wait on a condition. (Composes with `test-data-management`.)

### Assertions
- **Assert intent, not the implementation.** Check the observable outcome (status, payload field, side
  effect), not a re-derivation of what the code does internally.
- **Fluent / structured assertions** over a bare boolean: `expect(res).toHaveStatus(429)` reports *what*
  failed and *what was expected*; `assert res.ok` reports only "false".
- **Hard vs soft.** Use a hard assertion when a later step is meaningless if it fails (e.g. status before
  body); use soft/grouped assertions to collect several independent field checks into one clear report.
- **Validate error responses too** — error status, error schema/shape, and message — not just the 2xx path.

### Setup / teardown & resources
- Acquire in setup, release in teardown (or fixture scope); every created resource is cleaned up even when
  the test fails (try/finally or the framework's fixture teardown). Never leak a connection, file, or row.

### Import / formatting hygiene
- Imports are grouped and ordered by the formatter, not hand-sorted (see `code-formatting`); a logic diff
  should never carry import churn.

### ✅ / ❌
- ✅ deterministic, one behavior, fluent assertion on the outcome, cleans up in `finally`, traces an AC.
- ❌ two behaviors in one test, a fixed `sleep`, `assert res.status == 200` with no diagnostic, leaked state.
