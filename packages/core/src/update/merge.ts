// Self-contained, dependency-free line-based **diff3** three-way merge (R-040).
//
// `update` (R-034/R-039) reports user-edited files as `drift` and never touches
// them. With the rendered *base* now recorded in the manifest (R-039), we can do
// better: take the upstream delta (base → current template) and replay only its
// non-conflicting hunks onto the locally-edited file, leaving genuine conflicts
// for the user. This module is the merge core; `update/index.ts` decides when to
// call it and what to do with the result.
//
// Dependency-free on purpose: the repo keeps `core` lean (only `@clack/prompts`),
// and R-038 already hand-rolled its own semver compare rather than pull in a dep.
// A line-based diff3 is small and fully unit-testable, so we vendor it too.
//
// Safety bias: when the two sides' edits to the same region differ, we report a
// **conflict** rather than guess. `update` never writes conflicted files in R-040
// (R-041 adds interactive resolution), so a false conflict is harmless (the file
// is left untouched) while a wrong clean merge would not be — so we err toward
// conflicts by combining touching/overlapping change regions before comparing.

/** Conflict markers used when rendering a conflicted region (preview / R-041). */
export const CONFLICT_MARKERS = {
  /** Local (on-disk, user-edited) side. */
  mine: "<<<<<<< local (your edits)",
  sep: "=======",
  /** Upstream (current template) side. */
  theirs: ">>>>>>> template (upstream)",
} as const;

export interface MergeResult {
  /** True when no genuine conflict remained — the merge is safe to apply. */
  clean: boolean;
  /** Number of conflicting regions (0 when `clean`). */
  conflicts: number;
  /**
   * The merged text. When `clean`, this is ready to write. When not, it embeds
   * `CONFLICT_MARKERS` around each conflicting region (for preview, not writing).
   */
  content: string;
}

/** A maximal region in `o` (half-open `[oStart,oEnd)`) that maps to `[nStart,nEnd)` in `n`. */
interface Change {
  oStart: number;
  oEnd: number;
  nStart: number;
  nEnd: number;
}

/**
 * Three-way merge of text. `base` is the common ancestor (the recorded template
 * baseline); `mine` is the local on-disk file; `theirs` is the current template.
 * Operates on `\n`-split lines so `split('\n')` + `join('\n')` round-trips exactly
 * (a trailing newline becomes a shared empty final line and is preserved).
 */
export function merge3(mine: string, base: string, theirs: string): MergeResult {
  const a = mine.split("\n");
  const o = base.split("\n");
  const b = theirs.split("\n");

  const ca = changes(o, a);
  const cb = changes(o, b);

  const out: string[] = [];
  let conflicts = 0;
  let oPos = 0;
  let aPos = 0;
  let bPos = 0;
  let ia = 0;
  let ib = 0;

  while (oPos < o.length || ia < ca.length || ib < cb.length) {
    const aStart = ia < ca.length ? ca[ia]!.oStart : Infinity;
    const bStart = ib < cb.length ? cb[ib]!.oStart : Infinity;
    const nextStart = Math.min(aStart, bStart, o.length);

    // Emit the stable run [oPos, nextStart): identical in all three.
    while (oPos < nextStart) {
      out.push(o[oPos]!);
      oPos++;
      aPos++;
      bPos++;
    }

    if (ia >= ca.length && ib >= cb.length) break; // only the stable tail remained

    // Grow a combined change region. The seed change starts exactly at
    // regionStart; we then absorb a further change (either side) only if it
    // *strictly overlaps* the region so far (or shares the seed start). Using
    // half-open ranges, two changes that merely *touch* at a boundary (e.g. edits
    // on adjacent base lines) stay independent and both apply cleanly — only
    // genuinely overlapping edits are combined and compared for conflict.
    const regionStart = oPos;
    let regionEnd = oPos;
    const aHunks: Change[] = [];
    const bHunks: Change[] = [];
    const overlaps = (c: Change): boolean => c.oStart < regionEnd || c.oStart === regionStart;
    let grew = true;
    while (grew) {
      grew = false;
      while (ia < ca.length && overlaps(ca[ia]!)) {
        const c = ca[ia]!;
        regionEnd = Math.max(regionEnd, c.oEnd);
        aHunks.push(c);
        ia++;
        grew = true;
      }
      while (ib < cb.length && overlaps(cb[ib]!)) {
        const c = cb[ib]!;
        regionEnd = Math.max(regionEnd, c.oEnd);
        bHunks.push(c);
        ib++;
        grew = true;
      }
    }

    // Side line counts spanning the (possibly extended) region. Each hunk swaps
    // (oEnd-oStart) base lines for (nEnd-nStart) side lines; stable base lines in
    // the region map 1:1. aPos/bPos are aligned to the region start by invariant.
    const span = regionEnd - regionStart;
    const aLen = span + delta(aHunks);
    const bLen = span + delta(bHunks);
    const aContent = a.slice(aPos, aPos + aLen);
    const bContent = b.slice(bPos, bPos + bLen);
    aPos += aLen;
    bPos += bLen;
    oPos = regionEnd;

    if (sameLines(aContent, bContent)) {
      out.push(...aContent); // both sides made the identical change
    } else if (bHunks.length === 0) {
      out.push(...aContent); // only the local side changed this region
    } else if (aHunks.length === 0) {
      out.push(...bContent); // only the template changed this region
    } else {
      conflicts++;
      out.push(CONFLICT_MARKERS.mine, ...aContent, CONFLICT_MARKERS.sep, ...bContent, CONFLICT_MARKERS.theirs);
    }
  }

  return { clean: conflicts === 0, conflicts, content: out.join("\n") };
}

/** Net change in side-line count across a set of hunks (insertions positive). */
function delta(hunks: Change[]): number {
  let d = 0;
  for (const h of hunks) d += h.nEnd - h.nStart - (h.oEnd - h.oStart);
  return d;
}

function sameLines(x: string[], y: string[]): boolean {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * The maximal differing regions between `o` and `n`, derived from their longest
 * common subsequence: everything *between* consecutive common lines is a change.
 */
function changes(o: string[], n: string[]): Change[] {
  const pairs = lcs(o, n);
  const result: Change[] = [];
  let oPrev = 0;
  let nPrev = 0;
  for (const [oi, ni] of pairs) {
    if (oi > oPrev || ni > nPrev) {
      result.push({ oStart: oPrev, oEnd: oi, nStart: nPrev, nEnd: ni });
    }
    oPrev = oi + 1;
    nPrev = ni + 1;
  }
  if (o.length > oPrev || n.length > nPrev) {
    result.push({ oStart: oPrev, oEnd: o.length, nStart: nPrev, nEnd: n.length });
  }
  return result;
}

/**
 * Longest common subsequence of two line arrays, returned as increasing
 * `[oIndex, nIndex]` matched pairs. Standard O(n·m) DP + backtrack — fine for the
 * file sizes we scaffold (hundreds of lines).
 */
function lcs(o: string[], n: string[]): Array<[number, number]> {
  const rows = o.length;
  const cols = n.length;
  // dp[i][j] = LCS length of o[i:] and n[j:]
  const dp: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = cols - 1; j >= 0; j--) {
      row[j] = o[i] === n[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (o[i] === n[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
