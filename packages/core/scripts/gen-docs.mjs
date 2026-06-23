// Regenerate the committed docs (currently `docs/skill-catalog.md`) from the
// skill suite. The generator lives in `src/docs/skill-flows.ts`; the drift-guard
// test `tests/skill-flows.test.ts` doubles as the writer when `WRITE_DOCS=1`, so
// this just runs that test with the flag set — cross-platform, no extra deps.
//
//   npm run docs        (from the repo root)
//
// CI runs the same test *without* the flag, so a `skills.ts` change that is not
// regenerated here fails the build (docs-as-code).
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync("npx", ["vitest", "run", "skill-flows"], {
  cwd: coreDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, WRITE_DOCS: "1" },
});
process.exit(result.status ?? 1);
