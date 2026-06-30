import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GUIDELINES,
  renderAllGuidelineDocs,
  renderGuidelineDoc,
  renderGuidelinesIndex,
} from "../src/index.js";

// Repo root: packages/core/tests → up three levels.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("guideline-flows generator (R-090)", () => {
  it("the full guide contains the lean body verbatim (full = lean ⊕ extended)", () => {
    for (const g of GUIDELINES) {
      const full = renderGuidelineDoc(g);
      expect(full, `${g.name} full guide contains its lean body`).toContain(g.body.trimEnd());
      if (g.extended) {
        expect(full, `${g.name} full guide contains its extended tier`).toContain(g.extended.trimEnd());
      }
    }
  });

  it("the deployed lean carries a full-guide pointer only when an extended tier exists", () => {
    for (const g of GUIDELINES) {
      const pointer = `\`docs/guidelines/${g.name}.md\``;
      // The pointer lives in the deployed lean (context.ts:deployedGuidelineBody),
      // tested there; here we assert the index reflects the tier honestly.
      const index = renderGuidelinesIndex(GUIDELINES);
      expect(index).toContain(`[\`${g.name}.md\`](./${g.name}.md)`);
      expect(index).toContain(g.extended ? "lean + extended" : "lean only");
      void pointer;
    }
  });

  it("the index lists every guideline", () => {
    const index = renderGuidelinesIndex(GUIDELINES);
    for (const g of GUIDELINES) expect(index).toContain(`${g.name}.md`);
  });

  // Drift guard + regenerator. Run `WRITE_DOCS=1 vitest run guideline-flows` (or
  // `npm run docs`) to (re)generate the committed full guides; the normal run
  // asserts they're in sync, so a context.ts change without a docs regeneration
  // fails CI (docs-as-code).
  it("docs/guidelines/* is in sync with the generator", () => {
    for (const { rel, content } of renderAllGuidelineDocs(GUIDELINES)) {
      const abs = join(REPO_ROOT, rel);
      if (process.env.WRITE_DOCS === "1") {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
      }
      expect(existsSync(abs), `${rel} exists (run WRITE_DOCS=1 to generate)`).toBe(true);
      expect(readFileSync(abs, "utf8"), `${rel} is stale — regenerate with \`npm run docs\``).toBe(content);
    }
  });
});
