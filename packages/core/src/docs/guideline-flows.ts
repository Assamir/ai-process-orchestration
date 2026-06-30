import { type Guideline, GUIDELINE_DOCS_DIR, GUIDELINES } from "../model/context.js";

/**
 * Documentation generator (R-090) — the twin of `docs/skill-flows.ts`, but for the
 * guideline suite in `model/context.ts`. It emits the **full** guide for every
 * guideline into `docs/guidelines/<name>.md` (full = lean `body` ⊕ `extended`, so
 * the full text contains the deployed lean verbatim — duplication is impossible by
 * construction) plus a `docs/guidelines/README.md` index.
 *
 * It only **reads** `context.ts`; it ships nothing into target repos (the deployed
 * lean is written by `scaffold`, and carries only an inline-code pointer back to
 * the full guide here). The output is deterministic (no dates, no randomness) so
 * the committed `docs/guidelines/*` can be snapshot-verified against this generator
 * — a new guideline / a new `extended` tier auto-appears and the docs can never
 * silently drift (`tests/guideline-flows.test.ts`).
 */

const README_REL = `${GUIDELINE_DOCS_DIR}/README.md`;

const BANNER =
  "<!-- Auto-generated from packages/core/src/model/context.ts by " +
  "packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the " +
  "snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; " +
  "regenerate with `npm run docs`. -->";

/** Root-relative path of a guideline's generated full guide. */
export function guidelineDocRel(name: string): string {
  return `${GUIDELINE_DOCS_DIR}/${name}.md`;
}

/**
 * The **full** guide for one guideline: the banner, then the lean `body`, then the
 * `extended` tier when present. The lean is emitted verbatim so a fix to it shows
 * up in the full guide for free; `extended` is the only material unique to this
 * file. Guidelines with no `extended` render as just the lean (still the canonical
 * single-source copy, useful for review).
 */
export function renderGuidelineDoc(g: Guideline): string {
  const lean = g.body.trimEnd();
  const full = g.extended ? `${lean}\n\n${g.extended.trimEnd()}\n` : `${lean}\n`;
  return `${BANNER}\n\n${full}`;
}

/** The `docs/guidelines/README.md` index: one row per guideline, full-guide link + tier. */
export function renderGuidelinesIndex(guidelines: readonly Guideline[]): string {
  const out: string[] = [];
  out.push("# Guideline full guides");
  out.push("");
  out.push(
    "> **Auto-generated** from `packages/core/src/model/context.ts` by " +
      "`packages/core/src/docs/guideline-flows.ts` (R-090). **Do not edit by hand** — " +
      "the snapshot test `packages/core/tests/guideline-flows.test.ts` fails on drift; " +
      "regenerate with `npm run docs`.",
  );
  out.push("");
  out.push(
    "Each guideline ships a compressed **lean** tier into a target repo (loaded into " +
      "agent context just-in-time). The **full** guide below is the lean standard plus " +
      "an optional `extended` tier of deeper patterns and worked examples — maintainer " +
      "reference that is **never deployed**. The full guide literally contains the lean " +
      "verbatim, so the two can't drift (`full = lean ⊕ extended`).",
  );
  out.push("");
  out.push("| Guideline | Full guide | Tier |");
  out.push("|-----------|------------|------|");
  for (const g of guidelines) {
    const tier = g.extended ? "lean + extended" : "lean only";
    out.push(`| ${g.title} | [\`${g.name}.md\`](./${g.name}.md) | ${tier} |`);
  }
  out.push("");
  return `${out.join("\n").trimEnd()}\n`;
}

/**
 * The complete set of generated guideline docs (every `<name>.md` plus the index),
 * as `{ rel, content }` pairs — what the snapshot test writes/compares and what
 * `npm run docs` regenerates.
 */
export function renderAllGuidelineDocs(
  guidelines: readonly Guideline[] = GUIDELINES,
): Array<{ rel: string; content: string }> {
  const docs = guidelines.map((g) => ({ rel: guidelineDocRel(g.name), content: renderGuidelineDoc(g) }));
  docs.push({ rel: README_REL, content: renderGuidelinesIndex(guidelines) });
  return docs;
}
