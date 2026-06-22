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
import { applyResolutions, type ConflictChoice, diffLines, type MergeRegion } from "./merge.js";

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

// ---------------------------------------------------------------------------
// Interactive file-by-file walk (R-043).
//
// `update --interactive` steps through every actionable file one at a time and
// lets the user decide per file — apply / skip / show diff — instead of the bulk
// `--write`. Conflicts are still resolved region-by-region (reusing `resolveFile`
// above), so one walk covers create/update/merge *and* conflicts in document
// order. Deterministic, no LLM — the same `@clack/prompts` form family as the
// wizard and the conflict resolver. The CLI feeds the result into
// `runUpdate({ write: true, apply, resolutions })`.
// ---------------------------------------------------------------------------

/** One actionable file presented to the walk (a projection of an `UpdateItem`). */
export interface ChangeItem {
  /** Root-relative POSIX path. */
  rel: string;
  /** Only the actionable kinds reach the walk. */
  action: "create" | "update" | "merge" | "conflict";
  /** Short human reason carried from the classification. */
  detail?: string;
  /** Proposed content (+ current on-disk content) for the diff view; absent on conflicts. */
  preview?: { before?: string; after: string };
  /** Conflict regions for region-level resolution; present only on `conflict`. */
  conflict?: { regions: MergeRegion[]; count: number };
}

/**
 * The outcome of an interactive walk: which `create`/`update`/`merge` files the
 * user chose to apply, and the resolved content for each conflict they reconciled.
 * Both feed straight into `runUpdate({ write: true, apply, resolutions })`.
 */
export interface WalkResult {
  apply: string[];
  resolutions: Record<string, string>;
}

/**
 * Walk the actionable changes in document order, prompting per file. Returns the
 * selected files and resolved conflicts. A cancel (Ctrl-C) stops the walk and
 * applies whatever was decided before it — nothing already chosen is lost, and
 * undecided files are simply left untouched.
 */
export async function walkChanges(items: ChangeItem[]): Promise<WalkResult> {
  const apply: string[] = [];
  const resolutions: Record<string, string> = {};
  log.step(`Walking ${items.length} change(s) — apply / skip / diff per file.`);

  for (const item of items) {
    if (item.action === "conflict" && item.conflict) {
      const choices = await resolveFile({ rel: item.rel, regions: item.conflict.regions, count: item.conflict.count });
      if (choices !== null) resolutions[item.rel] = applyResolutions(item.conflict.regions, choices);
      continue; // skipped/cancelled conflicts stay conflicted
    }

    const decision = await decideFile(item);
    if (decision === "cancel") {
      log.warn("Stopped — applying the changes you've already chosen.");
      break;
    }
    if (decision === "apply") apply.push(item.rel);
  }

  return { apply, resolutions };
}

/**
 * Prompt apply / skip / diff for a single `create`/`update`/`merge` file. Loops
 * so "show diff" can re-present the file without consuming the decision. Returns
 * `"cancel"` if the user aborts the whole walk.
 */
async function decideFile(item: ChangeItem): Promise<"apply" | "skip" | "cancel"> {
  const verb = { create: "Create", update: "Update", merge: "Merge" }[item.action as "create" | "update" | "merge"];
  for (;;) {
    const choice = await select({
      message: `${item.rel} — ${verb}${item.detail ? ` (${item.detail})` : ""}?`,
      options: [
        { value: "apply", label: `Apply — ${verb.toLowerCase()} this file` },
        { value: "skip", label: "Skip — leave this file as-is" },
        { value: "diff", label: "Show diff" },
      ],
    });
    if (isCancel(choice)) return "cancel";
    if (choice === "diff") {
      note(previewDiff(item), `Diff: ${item.rel}`);
      continue;
    }
    return choice as "apply" | "skip";
  }
}

/** Render an item's pending change as a diff block for the `show diff` view. */
function previewDiff(item: ChangeItem): string {
  const p = item.preview;
  if (!p) return "(no preview available)";
  // A brand-new file (create) has no `before` — show it all as additions.
  if (p.before === undefined) return p.after.split("\n").map((l) => `+ ${l}`).join("\n");
  return diffLines(p.before, p.after);
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
