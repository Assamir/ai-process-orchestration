// Regenerate the committed docs (`docs/skill-catalog.md` from the skill suite,
// `docs/guidelines/*` from the guideline suite, and `docs/cost-dashboard.html`
// from the cost-dashboard generator) from `src/docs/*.ts`. The drift-guard tests
// `tests/skill-flows.test.ts` + `tests/guideline-flows.test.ts` +
// `tests/cost-dashboard.test.ts` double as the writers when `WRITE_DOCS=1`, so this
// just runs them (the `flows` + `cost-dashboard` filters match) with the flag set —
// cross-platform, no extra deps.
//
//   npm run docs        (from the repo root)
//
// CI runs the same tests *without* the flag, so a `skills.ts` / `context.ts` /
// dashboard change that is not regenerated here fails the build (docs-as-code).
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync("npx", ["vitest", "run", "flows", "cost-dashboard"], {
  cwd: coreDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, WRITE_DOCS: "1" },
});
process.exit(result.status ?? 1);
