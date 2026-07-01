import { createRequire } from "node:module";

/**
 * (R-081) Token estimation for the `doctor` footprint check — the same
 * dependency-free pattern `vscode/auditskill/.github/audit/scripts/_shared.mjs`
 * uses for Copilot configs: prefer `tiktoken` (cl100k, GPT-family) when it is
 * *globally importable*, otherwise fall back to a `chars / 4` heuristic. **Core
 * ships no tokenizer dependency** (the leaves must stay lean, per TECH §11), so in
 * this repo the fallback is what runs — deterministic, which keeps the footprint
 * numbers stable for the tests. If a consumer happens to have `tiktoken` installed
 * globally, the real encoder is used transparently and the tokenizer name reflects
 * it.
 *
 * `runDoctor` is synchronous, so — unlike the auditskill's async warmup — the
 * encoder is resolved through `createRequire` (a synchronous `require`) and cached.
 * A missing / non-CJS-loadable `tiktoken` simply resolves to the fallback.
 */
interface Encoder {
  encode(text: string): { length: number };
}

let encoder: Encoder | null | undefined;

function getEncoder(): Encoder | null {
  if (encoder !== undefined) return encoder;
  try {
    const require = createRequire(import.meta.url);
    const mod = require("tiktoken") as { get_encoding(name: string): Encoder };
    encoder = mod.get_encoding("cl100k_base");
  } catch {
    encoder = null;
  }
  return encoder;
}

/** The name of the tokenizer `estimateTokens` will use, for legible reporting. */
export function tokenizerName(): "tiktoken-cl100k" | "chars-div-4" {
  return getEncoder() ? "tiktoken-cl100k" : "chars-div-4";
}

/** Estimate the token count of `text` (see {@link tokenizerName} for the method). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // fall through to the heuristic
    }
  }
  return Math.ceil(text.length / 4);
}

/**
 * (R-081) Warn thresholds for the `doctor` token-budget check, in tokens. Calibrated
 * so a fresh scaffold on any topology (single-repo, multi-repo, embedded) sits
 * comfortably under budget on both platforms — the current footprint is ~1.6k for
 * the root map, ~1.3k for the largest guideline, ~1.5k for the largest skill, ~32k
 * total — while a real regression (a doubling, a thousand-line manual creeping into
 * the always-resident root map) trips a warn. Size is a **smell, not a defect**, so
 * every finding is a warn — the check can never fail a clean scaffold or break
 * parity. `rootMap` is the strategic one: the root config is the always-resident
 * surface that must survive compaction (TECH §11), so it earns the tightest budget.
 */
export interface TokenBudgets {
  /** The lean root config / "map" — always resident, must stay small. */
  rootMap: number;
  /** Any single guideline doc (lean tier; phase 2 fills it toward this). */
  guideline: number;
  /** Any single rendered skill file. */
  skill: number;
  /** The whole generated surface (root + guidelines + skills). */
  total: number;
}

export const TOKEN_BUDGETS: TokenBudgets = {
  rootMap: 2400,
  guideline: 2200,
  skill: 2400,
  total: 52000,
};
