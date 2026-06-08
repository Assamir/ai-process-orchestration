import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: false,
  // Bundle the private core into this leaf; keep @clack/prompts external (a real
  // runtime dependency installed alongside the bin).
  noExternal: ["@qa-orch/core"],
  banner: { js: "#!/usr/bin/env node" },
});
