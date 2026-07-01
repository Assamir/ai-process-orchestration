import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The leaf packages are intentionally thin (`src/index.ts` just calls `runCli`
// with an adapter), so a wiring typo — wrong adapter, a dropped `version`, a bad
// `bin` — would ship green today: nothing tests them. These checks pin that glue.
//
//  (A) Static wiring, always run: each leaf calls `runCli` with its own adapter,
//      forwards `pkg.version` (the R-038 manifest anchor), and declares a `bin`
//      pointing at the built `dist/index.js`.
//  (B) Built-artifact smoke, run only when `dist/index.js` exists (i.e. after
//      `npm run build`): `node dist/index.js --help` starts, prints usage, and the
//      bundle carries the `#!/usr/bin/env node` shebang tsup's banner adds.

interface Leaf {
  name: string;
  binName: string;
  adapter: string;
  dir: string;
}

const leaves: Leaf[] = [
  {
    name: "claude-qa-orchestrator",
    binName: "claude-qa-orchestrator",
    adapter: "claudeAdapter",
    dir: fileURLToPath(new URL("../../claude-qa-orchestrator", import.meta.url)),
  },
  {
    name: "copilot-qa-orchestrator",
    binName: "copilot-qa-orchestrator",
    adapter: "copilotAdapter",
    dir: fileURLToPath(new URL("../../copilot-qa-orchestrator", import.meta.url)),
  },
];

describe.each(leaves)("leaf $name — static wiring (R-080)", (leaf) => {
  const src = readFileSync(`${leaf.dir}/src/index.ts`, "utf8");
  const pkg = JSON.parse(readFileSync(`${leaf.dir}/package.json`, "utf8")) as {
    name: string;
    version: string;
    bin: Record<string, string>;
    files: string[];
  };

  it("calls runCli with its own adapter and forwards the package version", () => {
    expect(src).toContain("runCli");
    expect(src).toContain(leaf.adapter);
    expect(src).toContain("version: pkg.version"); // R-038: manifest.toolVersion anchor
    expect(src).toContain(`binName: "${leaf.binName}"`);
  });

  it("declares a valid bin pointing at the built dist and ships it", () => {
    expect(pkg.name).toBe(leaf.name);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.bin[leaf.binName]).toBe("dist/index.js");
    expect(pkg.files).toContain("dist");
  });
});

describe.each(leaves)("leaf $name — built-artifact smoke (R-080)", (leaf) => {
  const dist = `${leaf.dir}/dist/index.js`;
  const built = existsSync(dist);

  it.skipIf(!built)("bundles a shebang so the bin is directly executable", () => {
    const firstLine = readFileSync(dist, "utf8").split("\n", 1)[0];
    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  it.skipIf(!built)("`node dist/index.js --help` runs and prints usage", () => {
    const out = execFileSync("node", [dist, "--help"], { encoding: "utf8" });
    expect(out).toContain(leaf.binName);
    expect(out).toContain("Usage:");
  });
});
