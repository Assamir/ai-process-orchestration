<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Performance testing

> Phase 1 seeded this standard. Phase 2 records this project's concrete performance workflow in the `{{PLACEHOLDER}}` section.

Performance testing is the iron QA rule read from the **non-functional** side: a behavior's *speed and capacity* under load is verified the same way its *correctness* is — against a written target, with a result you actually observed. The `qa-performance` skill scripts and runs the load test (JMeter-first); this guideline governs *how* a performance test is designed so its numbers mean something. A load test with no defined budget, no baseline, or that asserts on averages is theater — it produces a graph nobody can pass or fail.

## Rules
- **NFRs before scripts.** Define the budget first: p95/p99 response time, throughput (req/s), max error-rate, and the concurrency to hold them at. "Fast enough" is not a target; "p95 < 300 ms at 200 concurrent users, error-rate < 1%" is. Every performance case traces to an NFR / acceptance criterion (composes with `spec-driven-development`); an undocumented target is a blocker, not a guess.
- **Percentiles, never averages.** Assert on p95/p99, not the mean — an average hides the slow tail that users actually feel. A run "passes" only when every percentile budget and the error-rate hold.
- **Record a baseline and compare.** Keep a baseline run to compare against so a regression is visible as a *delta*, not just an absolute number. "p95 rose from 180 ms to 240 ms since last release" is a finding; a lone "240 ms" is noise.
- **Realistic load shapes.** Model real usage: think-time between requests (no think-time overstates throughput), ramp-up, and parametrized/correlated data (CSV-driven, not one hard-coded user). Pick the profile deliberately — **load** (expected peak), **stress** (find the breaking point), **soak** (sustained, to catch leaks), **spike** (sudden surge).
- **Headless in CI, GUI only to author.** Runs are non-GUI (`jmeter -n -t … -l …jtl -e -o …`) so they are reproducible and CI-safe; the GUI is for building the plan, never for a measured run. A GUI run in CI is an anti-pattern (it can't even start without a display).

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — a written budget, a percentile assertion against a baseline, headless run:
```
NFR-2.1  "checkout p95 < 300 ms at 200 VUs, error-rate < 1%"
plan     checkout.jmx — 200-thread group, 1s think-time, CSV users, Duration Assertion @ 300ms
run      jmeter -n -t checkout.jmx -l results.jtl -e -o jmeter-report/
verdict  p95 = 268 ms (baseline 251 ms), errors 0.3% -> PASS, traces NFR-2.1
```

❌ **Avoid** — no budget, average instead of percentile, GUI run, one hard-coded user:
```
"ran the load test in the JMeter GUI, average response was ~250 ms, looks fine"
# no NFR to pass/fail, mean hides the p99 tail, not reproducible, single user ≠ load
```

## Applicable patterns

> Encouraged: the performance practices this project applies (think-time timers, CSV Data Set Config,
> ramp-up profiles, a committed baseline, percentile SLAs as assertions) so agents follow them.

{{PERF_PATTERNS}}

## Project-specific performance workflow

> Record this project's concrete setup once known: the NFR source, where the baseline lives, the load profiles run, the environment load tests run against, and how the `.jtl`/dashboard are published.

{{PROJECT_PERF_WORKFLOW}}
