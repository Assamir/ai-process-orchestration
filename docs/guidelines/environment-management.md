<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Environment & secrets management

> Phase 1 seeded this standard. Phase 2 records this project's concrete environment matrix in the `{{PLACEHOLDER}}` section.

Tests run against more than one environment — a developer's local stack, CI, a shared staging deployment — and each needs its own base URL, test accounts, and data seeds. The configuration that points a run at an environment must live in **environment variables**, never as a secret committed to the repo. This is the same `${VAR}` / `${env:VAR}` indirection the `atlassian` and Playwright browser MCP servers already use for their credentials: the repo declares *which* variables a run needs; the values come from the environment (a local `.env` that is git-ignored, the CI secret store, a vault). "What's not in context doesn't exist" cuts both ways — a secret that *is* in context (committed) is a leak.

## Rules
- **Never commit a secret.** No passwords, API tokens, connection strings, or test-account credentials in the repo — not in code, not in config, not in `context/`. Reference them by env-var name (`${BASE_URL}`, `${env:JIRA_API_TOKEN}`) and keep the real value in a git-ignored `.env`, the CI secret store, or a vault. This is the same indirection the `atlassian` / browser MCP wiring uses.
- **One environment matrix, recorded once.** Maintain the local / CI / staging matrix in `context/foundation/environments.md`: per environment, its base URL(s), how to obtain a test account, and which data seed it expects. A run names its target environment; it does not hard-code the target's URL.
- **Base URL is configuration, not a literal.** Tests read the base URL from the environment (`${BASE_URL}`), so the same suite runs anywhere. A URL pinned in a spec only works on the author's machine.
- **Test accounts and data seeds are per-environment and disposable.** Each environment has its own accounts and seed; never reuse a production account, and never assume staging data survives between runs. Record where each environment's seed comes from in `environments.md`.
- **CI is just another environment in the matrix.** Its variables come from the pipeline's secret store (wired by `qa-ci-pipeline`); the repo declares the names, the pipeline supplies the values.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the target is selected by environment, secrets come from the environment, nothing is committed:
```
# .env (git-ignored) — values never committed
BASE_URL=https://staging.shop.example
TEST_USER=qa-bot@example.com
TEST_PASSWORD=…            # from the vault / CI secret store

# test reads configuration, not a literal
await page.goto(process.env.BASE_URL + "/checkout");   // runs on local, CI, staging
```

❌ **Avoid** — environment pinned to one machine, a real secret committed to the repo:
```
await page.goto("https://staging.shop.example/checkout");  // only works here
const token = "ghp_aJ9…live-token";                        // leaked secret in git history
```

## Applicable patterns

> Encouraged: the environment patterns this project applies (`.env` + git-ignore, twelve-factor config,
> CI secret store, per-environment base-URL indirection, ephemeral/seeded test data) so agents follow them.

{{ENV_MGMT_PATTERNS}}

## Project-specific environment workflow

> Record this project's concrete matrix once known: each environment's base URL, how to get a test account, where its data seed comes from, and which secret store backs the env vars.

{{PROJECT_ENV_WORKFLOW}}
