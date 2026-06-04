import { cpSync, mkdirSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: false,
  // Prepend a shebang so the built file is directly executable as the npx bin.
  banner: { js: "#!/usr/bin/env node" },
  // Templates are read at runtime relative to the emitted file, so copy them
  // next to dist/index.js. Done in JS (not a shell cp) to stay cross-platform.
  async onSuccess() {
    mkdirSync("dist/templates", { recursive: true });
    cpSync("src/templates", "dist/templates", { recursive: true });
  },
});
