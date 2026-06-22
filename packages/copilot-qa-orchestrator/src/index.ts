import { copilotAdapter, runCli } from "@qa-orch/core";
import pkg from "../package.json" with { type: "json" };

runCli(copilotAdapter, {
  binName: "copilot-qa-orchestrator",
  toolName: "GitHub Copilot (VS Code)",
  version: pkg.version,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`copilot-qa-orchestrator: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
