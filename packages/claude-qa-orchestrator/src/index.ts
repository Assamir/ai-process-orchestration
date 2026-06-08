import { claudeAdapter, runCli } from "@qa-orch/core";

runCli(claudeAdapter, {
  binName: "claude-qa-orchestrator",
  toolName: "Claude Code",
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`claude-qa-orchestrator: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
