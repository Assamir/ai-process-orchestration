<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Grounding & anti-hallucination

> Phase 1 seeded this standard. Phase 2 records this project's ground-truth sources in the `{{PLACEHOLDER}}` section.

Every claim an agent makes about this system — a path, an API, a schema, a requirement, a test result — must be grounded in a real, checkable artifact. Inventing a plausible-looking file path, function name, or "passing" result is worse than admitting you don't know: it poisons `context/` and sends the next run down a dead end. "What's not in context doesn't exist": if you can't read it or cite it, treat it as unknown.

## Rules
- **Cite the source of every factual claim.** Reference `file:line`, a ticket id (e.g. Jira `PROJ-123`), or the result-MCP output you read it from. A claim with no citable source is a hypothesis — label it as one.
- **Never invent files, paths, APIs, schemas, or results.** If a path or symbol might exist, open it and confirm before relying on it; don't assert a test passed without reading the run's result artifact.
- **Flag uncertainty explicitly.** Write "I could not find…" or "unverified" rather than filling the gap with a confident guess. When you must infer, legalize it in a `## Assumptions` table (see the `assumptions` guideline) — inference outside that table is a hallucination. Surfacing a gap is a finding; hiding it is a defect.
- **Prefer reading over recalling.** Pull the artifact in (source, ticket, trace, JUnit XML via the result MCP) instead of relying on memory or training priors — especially for versions, paths, and API shapes that drift.
- This reinforces, never weakens, the iron QA rule: a "passing" test you did not actually observe pass is not evidence.

## Evidence types (ranked — strongest first)

Not all citations are equal. Prefer the strongest available source; reach down the list only when nothing higher exists, and mark the weaker ones as such.

| Rank | Evidence type | Citation form | Strength |
|---|---|---|---|
| 1 | Source code | `path/file.ext#L120-L140` | Strongest — deterministic, the system's own truth |
| 2 | Config / infrastructure | `path/application.yml#L10-L20` | Strong — deterministic |
| 3 | Test evidence | `path/SomeTest.ext#L45-L60` | Strong — documents intended behavior |
| 4 | Result-MCP / run artifact | `playwright-results: test-results/auth-login`, a JUnit XML row | Strong — the only truth about a *run* |
| 5 | Ticket / spec (MCP) | Jira `PROJ-123`, a Confluence page | Strong — authoritative for requirements |
| 6 | Existing doc in `context/` | `context/reference/…#L-L` | Medium — secondary, may be stale |
| 7 | Git history | `git log <file>` excerpt | Medium — historical context |
| 8 | External doc (URL) | `https://…` | Weak — volatile; verify before relying |
| 9 | User quote | "User said: …" | Authoritative *only* for user-provided facts |

## Minimum context for code citations (≥ 10 lines)

A citation must let a reader verify the claim **without reopening the file**. When citing code for a non-trivial claim, give a line *range* covering at least ~10 lines (or the whole method if shorter) — not a bare filename, not a single line ripped from its context. `src/auth/login.ts#L42-L58` is verifiable; `login.ts` is not. Trim a long method to the relevant 10–40 lines rather than pasting the whole file.

## Identifier scrub (before anything ships)

Before finalizing any output, list every proper noun and identifier in it and confirm each is real — this is where hallucinations hide:
- [ ] **Class / method / function names** — a search returns a match.
- [ ] **Endpoint paths** — match a controller annotation / route / OpenAPI entry.
- [ ] **Environment variables** — present in config or documented.
- [ ] **Ticket / test keys** (Jira, Xray) — fetched via MCP, never guessed.
- [ ] **File paths** — confirmed to exist (the broken-link check and `doctor` catch these in `context/`).

An identifier you cannot confirm is either an assumption (move it to the `assumptions` table) or a hallucination (drop it).

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — claims carry citations, and the gap is named instead of guessed:
```
Empty-password login is rejected by validateCredentials (src/auth/login.ts:42),
tracing to AC PROJ-217. Its e2e test passed this run — read via the
playwright-results MCP (test-results/auth-login). I could not find any test for
the lockout-after-5-tries path; flagging it as uncovered, not assuming covered.
```

❌ **Avoid** — confident, uncited, invented; no artifact was opened:
```
Login is handled in src/auth/AuthService.login() and all auth tests pass.
```

## Applicable patterns

> Encouraged: name the grounding practices this project relies on (cite-by-`file:line`,
> result-MCP as the only source of run truth, ticket-id traceability) so agents follow them.

{{GROUNDING_PATTERNS}}

## Project-specific ground-truth sources

> Record where this project's ground truth lives (the schema/SDK of record, the ticket system, the canonical result dirs) so agents read it instead of guessing.

{{PROJECT_GROUNDING_SOURCES}}

## Extended — anti-hallucination checklists

> Maintainer reference (adapted from the anti-hallucination / verification-steps source). The lean tier
> above is the deployed contract. Not loaded into agent context.

### Pre-completion verification (run before finishing any analysis or doc)
- **Classes & methods** — every class/method named exists (a search returns a match); no invented
  utility classes or helpers; imports/packages resolve.
- **Versions** — every version comes from a manifest you read (`package.json` / `pom.xml` / `go.mod` /
  `requirements.txt`), never an assumed or "typical" number.
- **Endpoints** — every endpoint verified in the controller/handler/route source; HTTP method and path
  match the actual annotation/decorator; request/response types confirmed.
- **Configuration** — env vars and property names exist in the real config; default values read, not assumed.
- **Integration points** — external-service client classes exist; integration URLs verified in config;
  the auth mechanism confirmed in code.
- **Source references** — every claim carries a `file:line`; the line numbers are accurate and the
  snippet matches the file.

### Red-flag phrases (each demands verification before it ships)
| Phrase | Action |
|---|---|
| "Typically uses…" | Verify in source |
| "Standard pattern is…" | Find a real example in the codebase |
| "Should have…" | Confirm it exists |
| "Probably configured…" | Read the actual config |
| "Similar to other services…" | Verify that specific service |
| "Common approach…" | Find the documented pattern |

These are the same "common practice" tells the `assumptions` guideline bans as a *basis*: if a sentence
leans on one, it is either an assumption (move it to the `## Assumptions` table with a real basis) or a
hallucination (drop it).

### Source-of-truth ordering
When two sources disagree, trust the one higher in the lean tier's evidence-type table: **source code >
config > test > result-MCP > ticket > existing doc > git > web > user recollection**. A doc in
`context/` can be stale; the code cannot. Never silently pick a winner — record the conflict
(`[Conflicting sources: A says X, B says Y]`) and resolve it explicitly.
