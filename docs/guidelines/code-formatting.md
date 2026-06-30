<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Code & doc formatting

> Phase 1 seeded this standard. Phase 2 records this project's concrete formatter setup in the `{{PLACEHOLDER}}` section.

Formatting is **deterministic and tool-owned**, never argued by hand. A configured autoformatter is the single source of truth for whitespace, line length, and import order; you run it, you don't reproduce it from memory or hand-tune to a personal style. This keeps review about behavior instead of style, and keeps diffs minimal — formatting churn buried in a logic change hides the change. The one exception is content the formatter would *mangle* — chiefly Mermaid diagrams (see `diagram-conventions`) — which is fenced off with `@formatter:off` / `@formatter:on` guards so the tool leaves it byte-stable.

- **Detected formatters / linters:** {{LINTERS}}

## Rules
- **The formatter is the source of truth.** Run the project's configured formatter/linter (`{{LINTERS}}`) before committing and let it decide whitespace, wrapping, and quoting. Don't hand-format to a different style and don't disable a rule to dodge a fix — fix the code. Once the formatter has run, style is not a review topic.
- **Format on save / pre-commit / in CI.** Wire the formatter to run automatically (editor on-save, a pre-commit hook, and a CI check that fails on a non-empty diff). A one-time "format the whole repo" commit pays the churn once; after that every change lands already-formatted, so each diff stays about behavior.
- **Deterministic import order.** Imports are grouped and ordered by the tool — a single canonical order (e.g. standard library → third-party → first-party → local, blank line between groups, side-effect/static imports last). Never hand-sort; let the formatter/linter enforce it so import blocks don't churn between authors.
- **Guard content the formatter would break.** Wrap anything whose exact layout is load-bearing — a Mermaid diagram, an aligned table, ASCII art, a deliberately ordered literal — in formatter-off guards so reflowing/reordering can't corrupt it. In Markdown use the HTML-comment form `<!-- @formatter:off -->` … `<!-- @formatter:on -->`; in code use the language's line-comment form (`// @formatter:off`, `# fmt: off`). Always pair an `off` with an `on` — an unclosed guard silently disables formatting for the rest of the file.
- **Guards are a scalpel, not a blanket.** Disable formatting for the smallest region that needs it; never wrap a whole file to avoid running the formatter. This composes with `diagram-conventions`: every rendered Mermaid block in `context/` and in reports carries the guard so it survives an autoformat pass — diagrams are born compliant.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — the diagram is fenced off so the formatter can't reflow it, and imports are left to the tool:
````markdown
<!-- @formatter:off -->
```mermaid
flowchart LR
  ac[Acceptance criterion] --> tc[Test case] --> at[Automated test]
```
<!-- @formatter:on -->
````

❌ **Avoid** — an un-guarded diagram (the next autoformat realigns the arrows and breaks the render) and hand-sorted imports that churn on every PR:
````
```mermaid
flowchart LR
  ac[Acceptance criterion]-->tc[Test case]
```
import { z } from "zod"; import { local } from "./local"; import { http } from "axios"; // hand-ordered, no grouping
````

## Applicable patterns

> Encouraged: name the formatting tools/configs this project standardizes on
> (Prettier + ESLint, Spotless + google-java-format, Black + ruff/isort, EditorConfig,
> a pre-commit framework) so agents run the right one.

{{FORMATTER_PATTERNS}}

## Project-specific formatting workflow

> Record this project's concrete setup once known: the formatter command, where its config lives, the pre-commit / CI hook that enforces it, and any standing `@formatter:off` regions.

{{PROJECT_FORMATTING_WORKFLOW}}
