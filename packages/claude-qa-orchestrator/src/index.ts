import { claudeAdapter, runCli } from "@qa-orch/core";
import pkg from "../package.json" with { type: "json" };

runCli(claudeAdapter, {
  binName: "claude-qa-orchestrator",
  toolName: "Claude Code",
  version: pkg.version,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`claude-qa-orchestrator: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
