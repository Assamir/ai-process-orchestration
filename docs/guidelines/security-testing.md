<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Security testing

> Phase 1 seeded this standard. Phase 2 records this project's concrete security workflow in the `{{PLACEHOLDER}}` section.

Security testing is the iron QA rule read from the **security** side: a behavior's resistance to misuse is
verified the same way its correctness is — against a written requirement, with a result you actually
observed. Every security case traces to a **security requirement / acceptance criterion** (composes with
`spec-driven-development`); a scan with no requirement to pass or fail is noise, not a test. The
`qa-security` skill runs the tooling (DAST-first, OWASP ZAP); this guideline governs *how* a security
test is designed so its findings mean something.

## Rules
- **A threat model is the input.** Before scanning, state what you are protecting and against whom (the
  assets, the entry points, the trust boundaries). The threat model is the spec security cases trace to —
  "scan the app" is not a target; "an unauthenticated user must not read another tenant's orders" is.
- **OWASP Top-10 / ASVS as the baseline.** Map every finding to a recognized identifier (OWASP Top-10
  category, CWE, ASVS requirement) so it is triageable and traceable, not just a scanner line.
- **Shift left.** Dependency scanning and static checks run early (in the loop / pre-merge); DAST runs
  against a deployed environment. Catch what you can before deploy; verify the rest against the running app.
- **Record a vulnerability baseline and triage against it.** Keep a baseline of known/accepted findings so
  a new run surfaces *new* issues as a delta — a known, risk-accepted item must not re-fail the gate, and a
  new Critical must not hide in the noise. Triage by severity (CVSS / OWASP severity), never by raw scanner
  count: ten Lows are not one Critical.
- **Headless & CI-safe; secrets out of scan config.** Run scans non-interactively so they are reproducible
  in CI (the GUI is only for authoring a scan profile). Scan configuration flows credentials through
  environment variables (see `environment-management`) — never a token committed in a `.zap` / scan file.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — a requirement-anchored finding, mapped to a standard, triaged against a baseline:
```
SR-1.2  "an unauthenticated request to /orders/{id} must return 401, never order data"
scan    ZAP baseline (headless) against staging, auth via ${ZAP_AUTH_TOKEN}
finding A01:2021 Broken Access Control (CWE-862) — /orders/42 returns 200 unauthenticated
verdict NEW vs baseline, Critical -> fails the gate, traces SR-1.2
```

❌ **Avoid** — no requirement, raw counts, a clean baseline read as "secure", a committed secret:
```
"ran ZAP, 0 alerts on the login page, so the app is secure"   # no threat model, partial scope
# .zap config with ZAP_AUTH_TOKEN="ghp_live…" committed to the repo (leaked secret)
```

## Applicable patterns

> Encouraged: the security-testing practices this project applies (DAST baseline vs full scan, dependency
> scanning in CI, a committed vulnerability baseline, OWASP/CWE mapping on findings, severity-gated
> pipelines) so agents follow them.

{{SECURITY_PATTERNS}}

## Project-specific security workflow

> Record this project's concrete setup once known: the threat-model source, the DAST tool + scan profiles,
> where the vulnerability baseline lives, the severity gate, and which secret store backs the scan env vars.

{{PROJECT_SECURITY_WORKFLOW}}
