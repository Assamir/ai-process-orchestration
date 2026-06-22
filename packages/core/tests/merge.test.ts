import { describe, expect, it } from "vitest";
import { applyResolutions, CONFLICT_MARKERS, merge3 } from "../src/index.js";

describe("merge3 (3-way line merge, R-040)", () => {
  it("returns the base unchanged when no side changed", () => {
    const base = "a\nb\nc\n";
    const r = merge3(base, base, base);
    expect(r.clean).toBe(true);
    expect(r.conflicts).toBe(0);
    expect(r.content).toBe(base);
  });

  it("takes the local side when only it changed (template unchanged)", () => {
    const base = "a\nb\nc\n";
    const mine = "a\nB-edit\nc\n";
    const r = merge3(mine, base, base);
    expect(r.clean).toBe(true);
    expect(r.content).toBe(mine);
  });

  it("takes the template side when only it changed (file pristine)", () => {
    const base = "a\nb\nc\n";
    const theirs = "a\nb\nc\nd-new\n";
    const r = merge3(base, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.content).toBe(theirs);
  });

  it("merges disjoint edits from both sides cleanly", () => {
    const base = "L1\nL2\nL3\nL4\nL5\n";
    const mine = "L1x\nL2\nL3\nL4\nL5\n"; // local edited the first line
    const theirs = "L1\nL2\nL3\nL4\nL5y\n"; // template edited the last line
    const r = merge3(mine, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.content).toBe("L1x\nL2\nL3\nL4\nL5y\n");
  });

  it("does not duplicate or conflict when both sides made the identical edit", () => {
    const base = "a\nb\nc\n";
    const same = "a\nB!\nc\n";
    const r = merge3(same, base, same);
    expect(r.clean).toBe(true);
    expect(r.content).toBe(same);
  });

  it("merges edits on adjacent (touching but disjoint) lines without conflict", () => {
    const base = "A\nB\nC\n";
    const mine = "A\nB1\nC\n"; // local edited line B
    const theirs = "A\nB\nC1\n"; // template edited the next line C
    const r = merge3(mine, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.content).toBe("A\nB1\nC1\n");
  });

  it("conflicts when both sides edit the same region differently", () => {
    const base = "a\nb\nc\n";
    const mine = "a\nMINE\nc\n";
    const theirs = "a\nTHEIRS\nc\n";
    const r = merge3(mine, base, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts).toBe(1);
    expect(r.content).toContain(CONFLICT_MARKERS.mine);
    expect(r.content).toContain("MINE");
    expect(r.content).toContain(CONFLICT_MARKERS.sep);
    expect(r.content).toContain("THEIRS");
    expect(r.content).toContain(CONFLICT_MARKERS.theirs);
  });

  it("merges an upstream append with a local middle edit (the common migration case)", () => {
    const base = "# Title\n\nIntro.\n\n## Section\nBody.\n";
    const mine = "# Title\n\nIntro EDITED.\n\n## Section\nBody.\n"; // user reworded intro
    const theirs = "# Title\n\nIntro.\n\n## Section\nBody.\n\n## New\nUpstream addition.\n"; // upstream appended
    const r = merge3(mine, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.content).toBe("# Title\n\nIntro EDITED.\n\n## Section\nBody.\n\n## New\nUpstream addition.\n");
  });

  it("preserves a trailing newline (and its absence)", () => {
    expect(merge3("a\nb\n", "a\nb\n", "a\nb\nc\n").content.endsWith("\n")).toBe(true);
    const noNl = merge3("a\nb", "a\nb", "a\nbc");
    expect(noNl.clean).toBe(true);
    expect(noNl.content).toBe("a\nbc");
  });

  it("handles independent multi-region edits across a larger file", () => {
    const base = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n") + "\n";
    const mine = base.replace("line2", "line2-mine"); // edit near the top
    const theirs = base.replace("line8", "line8-theirs"); // edit near the bottom
    const r = merge3(mine, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.content).toContain("line2-mine");
    expect(r.content).toContain("line8-theirs");
  });
});

describe("merge regions + applyResolutions (R-041)", () => {
  it("a clean merge has no conflict regions and rebuilds to its content", () => {
    const base = "a\nb\nc\n";
    const r = merge3("a\nB-edit\nc\n", base, base);
    expect(r.regions.some((rg) => rg.kind === "conflict")).toBe(false);
    // With no conflicts, any choice array (incl. empty) rebuilds the merged text.
    expect(applyResolutions(r.regions, [])).toBe(r.content);
  });

  it("exposes each conflict region with all three sides", () => {
    const r = merge3("a\nMINE\nc\n", "a\nb\nc\n", "a\nTHEIRS\nc\n");
    const conflicts = r.regions.filter((rg) => rg.kind === "conflict");
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0]!;
    expect(c).toMatchObject({ kind: "conflict", base: ["b"], mine: ["MINE"], theirs: ["THEIRS"] });
  });

  it("reconstructs the file from per-conflict choices (no markers)", () => {
    const r = merge3("a\nMINE\nc\n", "a\nb\nc\n", "a\nTHEIRS\nc\n");
    const keepMine = applyResolutions(r.regions, ["mine"]);
    const takeTheirs = applyResolutions(r.regions, ["theirs"]);
    expect(keepMine).toBe("a\nMINE\nc\n");
    expect(takeTheirs).toBe("a\nTHEIRS\nc\n");
    for (const out of [keepMine, takeTheirs]) {
      expect(out).not.toContain(CONFLICT_MARKERS.mine);
      expect(out).not.toContain(CONFLICT_MARKERS.sep);
      expect(out).not.toContain(CONFLICT_MARKERS.theirs);
    }
  });

  it("resolves multiple conflicts independently, in document order", () => {
    const base = "h\nA\nm\nB\nt\n";
    const mine = "h\nA1\nm\nB1\nt\n"; // local edits both regions
    const theirs = "h\nA2\nm\nB2\nt\n"; // upstream edits both regions differently
    const r = merge3(mine, base, theirs);
    expect(r.regions.filter((rg) => rg.kind === "conflict")).toHaveLength(2);
    // Take theirs for the first conflict, keep mine for the second.
    expect(applyResolutions(r.regions, ["theirs", "mine"])).toBe("h\nA2\nm\nB1\nt\n");
  });

  it("defaults a missing choice to keeping the local side", () => {
    const r = merge3("a\nMINE\nc\n", "a\nb\nc\n", "a\nTHEIRS\nc\n");
    expect(applyResolutions(r.regions, [])).toBe("a\nMINE\nc\n");
  });
});
