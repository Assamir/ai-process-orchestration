import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, note, outro } from "@clack/prompts";
import { detectStack } from "./detect/index.js";
import { installSkill } from "./install-skill/index.js";
import { scaffold } from "./scaffold/index.js";
import type { WriteResult } from "./types.js";
import { defaultAnswers, runWizard } from "./wizard/index.js";

const HELP = `claude-agent-scaffold — phase-1 installer for multi-agent AI setups

Usage:
  npx claude-agent-scaffold [init] [options]

Commands:
  init            Detect the stack, run the wizard, and scaffold /.ai + the Claude Code skill (default)

Options:
  --root <dir>    Target project directory (default: current directory)
  --skill-name <name>   Name of the installed Claude Code skill (default: agent-config)
  -y, --yes       Skip the wizard and accept detected defaults (non-interactive / CI)
  -h, --help      Show this help
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string", default: "." },
      "skill-name": { type: "string", default: "agent-config" },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0] ?? "init";
  if (values.help || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command !== "init") {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  }

  const root = resolve(values.root);
  const skillName = values["skill-name"];

  intro("claude-agent-scaffold");
  log.step(`Scanning ${root}`);

  const stack = detectStack(root);
  if (stack.language === null) {
    log.warn("No supported build manifest found (Node/Java/Python). Continuing with generic defaults.");
  }

  const answers = values.yes ? defaultAnswers(stack) : await runWizard(stack);
  if (answers === null) return 0; // user cancelled

  const written: WriteResult[] = [
    ...scaffold({ root, stack, answers, skillName }),
    installSkill({ root, skillName, stack, answers }),
  ];

  note(written.map((w) => `${w.status === "created" ? "+" : "·"} ${rel(root, w.path)} (${w.status})`).join("\n"), "Files");

  const created = written.filter((w) => w.status === "created").length;
  const skipped = written.length - created;
  log.success(`${created} created, ${skipped} skipped.`);
  outro(`Next: open Claude Code in this project and run the "${skillName}" skill to complete phase 2.`);
  return 0;
}

function rel(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, "") : abs;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`claude-agent-scaffold: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
