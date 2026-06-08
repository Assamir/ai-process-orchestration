import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, note, outro } from "@clack/prompts";
import type { PlatformAdapter } from "./adapters/types.js";
import { detectStack } from "./detect/index.js";
import { runDoctor } from "./doctor/index.js";
import { scaffold } from "./scaffold/index.js";
import type { WriteResult } from "./types.js";
import { defaultAnswers, runWizard } from "./wizard/index.js";

export interface CliMeta {
  /** The published bin / package name, used in help + messages. */
  binName: string;
  /** Human name of the target tool, e.g. "Claude Code" or "GitHub Copilot (VS Code)". */
  toolName: string;
}

/**
 * Shared CLI entry point for both leaf packages, so behavior stays in lock-step
 * (functional parity). Routes the first positional to a command:
 *   init    — phase-1 installer (default)
 *   doctor  — deterministic validator of a scaffolded orchestration
 */
export async function runCli(adapter: PlatformAdapter, meta: CliMeta): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string", default: "." },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0] ?? "init";
  if (values.help || command === "help") {
    process.stdout.write(help(meta.binName));
    return 0;
  }

  const root = resolve(values.root);
  if (command === "init") return doInit(adapter, meta, root, values.yes);
  if (command === "doctor") return doDoctor(adapter, meta, root);

  process.stderr.write(`Unknown command: ${command}\n\n${help(meta.binName)}`);
  return 1;
}

async function doInit(
  adapter: PlatformAdapter,
  meta: CliMeta,
  root: string,
  yes: boolean,
): Promise<number> {
  intro(meta.binName);
  log.step(`Scanning ${root}`);

  const stack = detectStack(root);
  if (stack.language === null) {
    log.warn("No supported build manifest found (Node/Java/Python). Continuing with generic defaults.");
  }

  const answers = yes ? defaultAnswers(stack) : await runWizard(stack);
  if (answers === null) return 0; // user cancelled

  const written: WriteResult[] = scaffold({ root, adapter, stack, answers });

  note(
    written.map((w) => `${w.status === "created" ? "+" : "·"} ${rel(root, w.path)} (${w.status})`).join("\n"),
    "Files",
  );

  const created = written.filter((w) => w.status === "created").length;
  const skipped = written.length - created;
  log.success(`${created} created, ${skipped} skipped.`);
  outro(`Next: open ${meta.toolName} in this project and run the "qa-init" ${adapter.invokeNoun} to complete phase 2.`);
  return 0;
}

function doDoctor(adapter: PlatformAdapter, meta: CliMeta, root: string): number {
  intro(`${meta.binName} doctor`);
  log.step(`Validating ${root} (${meta.toolName})`);

  const report = runDoctor(root, adapter);

  if (report.findings.length === 0) {
    log.success("No issues found.");
    outro("Healthy.");
    return 0;
  }

  const lines = report.findings.map(
    (f) => `${f.severity === "error" ? "x" : "!"} [${f.id}] ${f.message}\n    -> ${f.remediation}`,
  );
  note(lines.join("\n"), "Findings");

  if (report.errorCount > 0) {
    log.error(`${report.errorCount} error(s), ${report.warnCount} warning(s).`);
    outro("Doctor found errors.");
    return 1;
  }
  log.warn(`${report.warnCount} warning(s).`);
  outro("Completed with warnings.");
  return 0;
}

function help(binName: string): string {
  return `${binName} — QA-process orchestration scaffolder

Usage:
  npx ${binName} [command] [options]

Commands:
  init            Detect the test stack, run the wizard, and scaffold the QA orchestration (default)
  doctor          Validate an existing scaffold (structure, manifest, placeholders, links, iron QA rule)

Options:
  --root <dir>    Target project directory (default: current directory)
  -y, --yes       (init) Skip the wizard and accept detected defaults (non-interactive / CI)
  -h, --help      Show this help
`;
}

function rel(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, "") : abs;
}
