import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Create an isolated temp directory and a cleanup function. */
export function tempProject(): {
  dir: string;
  write: (rel: string, content: string) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "qa-orch-test-"));
  return {
    dir,
    write: (rel, content) => writeFileSync(join(dir, rel), content, "utf8"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
