import { fileURLToPath } from "node:url";

// This module lives as a sibling of the `templates/` directory in BOTH layouts:
//  - source / tests (vitest): src/templates-path.ts  -> src/templates/
//  - bundled (tsup):          dist/index.js          -> dist/templates/ (copied by onSuccess)
// So `./templates/` relative to import.meta.url resolves correctly in each case.
export function templatesDir(): string {
  return fileURLToPath(new URL("./templates/", import.meta.url));
}
