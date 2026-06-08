import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** True if `rel` exists under `root`. */
export function exists(root: string, rel: string): boolean {
  return existsSync(join(root, rel));
}

/** Read `rel` under `root` as UTF-8, or return null if it does not exist. */
export function readIfExists(root: string, rel: string): string | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

/** First of `rels` that exists under `root`, or null. */
export function firstExisting(root: string, rels: string[]): string | null {
  return rels.find((rel) => exists(root, rel)) ?? null;
}
