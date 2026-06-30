<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Test-data management

> Phase 1 seeded this standard. Phase 2 records this project's concrete data workflow in the `{{PLACEHOLDER}}` section.

The `qa-test-data-gen` factories/fixtures *produce* test data; this guideline governs its **lifecycle** — how data is kept fresh, isolated, seeded, cleaned up, and anonymized. A test that depends on data another test left behind, or on a row that happens to exist today, is not deterministic; it is a flake waiting to fire. Each test owns the data it needs: it sets that data up, and it tears it down, so the suite gives the same result on an empty database as on a full one, run alone or in parallel. This composes with `environment-management` (each environment has its own disposable seed) and reinforces the iron QA rule (a test you can't re-run cleanly is not evidence).

## Rules
- **Isolation between tests and runs.** A test never depends on data another test created or on order of execution. Create what you need inside the test (or its fixture); assume nothing about pre-existing rows. Two runs of the same suite, or two tests in parallel, must not collide — namespace data per test (unique ids/emails) so they can't.
- **Set up and tear down — clean up what you create.** Each test (or its fixture scope) is responsible for cleanup: delete created rows, reset mutated state, release seeded accounts. Prefer transactional rollback or an ephemeral/seeded database over hand-written deletes where the stack allows. Never leave residue that the next run must reason about.
- **Deterministic seeds.** When data is randomized (faker and friends), pin the seed so a failure reproduces; record the seed with the run. "Random but logged" beats "random and irreproducible". A fixed seed turns a heisenbug into a bug.
- **Freshness over staleness.** Don't rely on long-lived shared fixtures that drift from the schema; regenerate from the factories (which validate against the real contract) rather than maintaining a hand-edited dump. Stale seed data is the same hazard as a stale doc — "what's not regenerable rots".
- **No real PII — anonymize.** Never seed tests with real customer data. Use synthetic/faked values, or anonymized/masked extracts if production-shaped data is genuinely required. Real PII in a test fixture is the same leak class as a committed secret (see `environment-management`).

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the test seeds its own uniquely-named data and tears it down; nothing leaks between runs:
```
test("locks the account after 5 failed logins", async () => {
  const user = await createUser({ email: uniqueEmail() }); // synthetic, per-test
  try {
    await failLogin(user, 5);
    await expect(login(user)).toBeRejectedWith("locked"); // AC-4.2
  } finally {
    await deleteUser(user); // cleanup — same result on a clean or full DB
  }
});
```

❌ **Avoid** — depends on shared pre-existing data, leaves residue, and uses a real person:
```
test("account locks", async () => {
  // assumes "jane.doe@gmail.com" (a real customer) already exists from another test
  await failLogin("jane.doe@gmail.com", 5);
  expect(isLocked).toBe(true);   // order-dependent; no cleanup; PII in the repo
});
```

## Applicable patterns

> Encouraged: the data-lifecycle patterns this project applies (transactional rollback per test,
> ephemeral/containerized DB, fixture-scoped setup/teardown, seeded faker, data namespacing by test id)
> so agents follow them.

{{TEST_DATA_PATTERNS}}

## Project-specific data workflow

> Record this project's concrete lifecycle once known: how a test gets a clean slate, where seeds come from, the cleanup mechanism, the seed-logging convention, and the anonymization source for production-shaped data.

{{PROJECT_TEST_DATA_WORKFLOW}}

## Extended — factories, constants & migration

> Maintainer reference (generalized from the test-data-management source). The lean tier above is the
> deployed contract; this records the structural patterns that keep data DRY and maintainable.

### Centralize, then reuse
Test data lives in **one place per domain** (a factory / fixtures module / data class), not scattered as
inline literals across specs. A field that changes (a required header, a new mandatory property) is then a
one-line edit, not a find-and-replace across the suite. This is the structural complement to R-010's
factories: R-010 *produces* schema-valid objects; this governs *where they live and how they're named*.

### Factory / builder methods
- Name by **intent**: `aValidCheckout()`, `anExpiredCard()`, `aUserWithoutPermission()` — the call site
  reads as the scenario.
- Return a **builder** (or an object with overrides) so a test tweaks only the field it cares about and
  inherits valid defaults for the rest: `aValidCheckout({ currency: "GBP" })`.
- Boundary/invalid variants are **overrides on the valid base**, never a separate hand-maintained literal,
  so they stay in sync with the contract.

### Constants
Group fixed values by domain and name them in `UPPER_SNAKE`; never bury a magic literal in a test. A
shared constant is read once and reused, so a contract change updates every test through one edit.

### Environment-specific data
Each environment (local / CI / staging) owns its **own** seed and accounts (composes with
`environment-management`); a test names its target environment and reads the data for it, never
hard-coding a staging id. Per-test overrides layer on top of the environment defaults.

### Migration (hardcoded → managed)
When you find inline literals: (1) extract them to the domain factory/constants, (2) replace each literal
with a named reference, (3) parametrize the values that vary, (4) confirm the test still passes against a
clean database. Do it as a dedicated refactor, not buried in a behavior change.

### ✅ / ❌
- ✅ `const user = await aUser({ email: uniqueEmail() }); try { … } finally { await deleteUser(user); }`
- ❌ a literal `"jane.doe@gmail.com"` (real PII) reused across specs with no setup/teardown.
