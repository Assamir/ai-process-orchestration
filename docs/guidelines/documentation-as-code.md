<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Documentation as code

> Phase 1 seeded this standard. Phase 2 records the project-specific doc workflow in the `{{PLACEHOLDER}}` section.

QA knowledge is treated like source code, not like a wiki. Everything under `context/` and the guideline docs lives **in the repo**, is **versioned** with the code it describes, is **reviewed in the same pull request** as the change it documents, is **validated deterministically** by `doctor` (structure, links, placeholders, the iron QA rule, the mandatory good/bad examples), and is **kept in sync via CI** — the same pipeline `qa-ci-pipeline` builds runs `doctor` so docs can't silently rot. "What's not in context doesn't exist": if it isn't written down here, the agent can't use it.

## Rules
- A behavior change and its docs land in **one PR**. Updating `context/changes/<id>/` or a guideline is part of the change, not a follow-up.
- Docs link out to real source paths and `context/foundation/*`; they never duplicate code or restate general testing advice. Link, don't copy.
- `doctor` is the gate, not a human eyeball: broken relative links, leftover phase-1 placeholders, a missing iron QA rule, or a guideline without good/bad examples are **errors** that fail the build.
- Plans are first-class artifacts: active work in `context/changes/<id>/`, completed work in `context/archive/<id>/` (read-only history). Don't delete history — supersede it.
- Run `doctor` in CI (wired by `qa-ci-pipeline`) so documentation drift fails the pipeline the same way a failing test does.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the doc changes ride with the code in the same reviewed, CI-checked PR:
```
PR #142  "feat: rate-limit checkout (AC-3.1)"
  src/checkout/limiter.ts          (code)
  tests/checkout/limit.spec.ts     (test)
  context/changes/checkout-rate-limit/cases.md   (doc, traces AC-3.1)
  CI: doctor ✅  tests ✅  -> merge
```

❌ **Avoid** — knowledge that lives outside the repo, or docs merged without validation:
```
"the rate-limit details are in the Confluence page / a Slack thread"
context/foundation/tools.md links to ./does-not-exist.html   # broken link, no CI gate
```

## Applicable patterns

> Encouraged: the doc-as-code practices this project applies (docs-in-PR, ADRs, `doctor` in CI,
> generated-from-source reference docs) so agents follow the same workflow.

{{DOCS_AS_CODE_PATTERNS}}

## Project-specific doc workflow

> Record this project's concrete workflow once known: where docs are reviewed, which CI job runs `doctor`, any doc owners.

{{PROJECT_DOC_WORKFLOW}}
