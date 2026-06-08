import { copilotAdapter, runInit } from "@qa-orch/core";

runInit(copilotAdapter, {
  binName: "copilot-qa-orchestrator",
  toolName: "GitHub Copilot (VS Code)",
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`copilot-qa-orchestrator: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
