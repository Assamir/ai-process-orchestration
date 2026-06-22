// Interactive conflict-resolution form (R-041).
//
// When `update --write` finds a `conflict` (the 3-way merge of R-040 couldn't
// reconcile a region automatically), this walks the conflicted files and asks the
// user to resolve each conflict region: keep their local edits, take the upstream
// template, view the diff, or skip the whole file. Deterministic, **no LLM** — the
// QA analog of the `init` wizard, built on the same `@clack/prompts`.
//
// It lives in `core` (like the wizard) so both leaf packages share one
// implementation; the CLI (`cli.ts`) invokes it and feeds the result back into
// `runUpdate({ write: true, resolutions })`.

import { isCancel, log, note, select } from "@clack/prompts";
import { applyResolutions, type ConflictChoice, type MergeRegion } from "./merge.js";

/** A single conflicted file handed to the resolver (from a `conflict` UpdateItem). */
export interface ConflictFile {
  /** Root-relative POSIX path. */
  rel: string;
  /** The full ordered merge regions (stable + conflict) for reconstruction. */
  regions: MergeRegion[];
  /** Number of conflict regions in `regions`. */
  count: number;
}

/**
 * Interactively resolve conflicted files. Returns a map of `rel` → fully-resolved
 * file content for every file the user resolved completely; files they skip (or a
 * cancel) are omitted, so the caller leaves them reported-but-untouched. The
 * returned content has no conflict markers and is safe to write.
 */
export async function resolveConflicts(conflicts: ConflictFile[]): Promise<Record<string, string>> {
  const resolutions: Record<string, string> = {};
  for (const file of conflicts) {
    const choices = await resolveFile(file);
    if (choices === null) continue; // skipped or cancelled — leave the conflict
    resolutions[file.rel] = applyResolutions(file.regions, choices);
  }
  return resolutions;
}

/**
 * Walk one file's conflict regions. Returns the per-conflict choices in document
 * order, or `null` if the user skipped this file (or cancelled) — in which case
 * the file is left conflicted.
 */
async function resolveFile(file: ConflictFile): Promise<ConflictChoice[] | null> {
  const conflictRegions = file.regions.filter((r): r is Extract<MergeRegion, { kind: "conflict" }> => r.kind === "conflict");
  log.step(`${file.rel} — ${file.count} conflict(s) with the upstream template`);

  const choices: ConflictChoice[] = [];
  for (let i = 0; i < conflictRegions.length; i++) {
    const region = conflictRegions[i]!;
    // Loop so "show diff" can re-present the same conflict without consuming it.
    for (;;) {
      const choice = await select({
        message: `Conflict ${i + 1}/${conflictRegions.length} in ${file.rel}`,
        options: [
          { value: "mine", label: "Keep mine — your local edits" },
          { value: "theirs", label: "Take theirs — the upstream template" },
          { value: "diff", label: "Show diff (mine / base / theirs)" },
          { value: "skip", label: "Skip this file — leave it conflicted" },
        ],
      });
      if (isCancel(choice) || choice === "skip") return null;
      if (choice === "diff") {
        note(renderConflict(region), `Conflict ${i + 1}/${conflictRegions.length}`);
        continue;
      }
      choices.push(choice as ConflictChoice);
      break;
    }
  }
  return choices;
}

/** Format a conflict region as a three-way diff block for the `show diff` view. */
function renderConflict(region: Extract<MergeRegion, { kind: "conflict" }>): string {
  const block = (label: string, lines: string[]): string =>
    `── ${label} ──\n${lines.length > 0 ? lines.join("\n") : "(empty)"}`;
  return [
    block("mine (your local edits)", region.mine),
    block("base (last scaffolded)", region.base),
    block("theirs (upstream template)", region.theirs),
  ].join("\n\n");
}
