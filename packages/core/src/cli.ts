import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, note, outro } from "@clack/prompts";
import type { PlatformAdapter } from "./adapters/types.js";
import { detectStack } from "./detect/index.js";
import { fixLinks, runDoctor } from "./doctor/index.js";
import { scaffold } from "./scaffold/index.js";
import type { WriteResult } from "./types.js";
import { runUpdate, type UpdateReport } from "./update/index.js";
import { resolveConflicts } from "./update/resolve.js";
import { defaultAnswers, runWizard } from "./wizard/index.js";

export interface CliMeta {
  /** The published bin / package name, used in help + messages. */
  binName: string;
  /** Human name of the target tool, e.g. "Claude Code" or "GitHub Copilot (VS Code)". */
  toolName: string;
  /**
   * The running package version (from the leaf's `package.json`). Recorded as
   * `manifest.toolVersion` by `init` and compared by `update` (R-038).
   */
  version: string;
}

/**
 * Shared CLI entry point for both leaf packages, so behavior stays in lock-step
 * (functional parity). Routes the first positional to a command:
 *   init    — phase-1 installer (default)
 *   doctor  — deterministic validator of a scaffolded orchestration
 *   update  — deterministic migration of an existing scaffold to current templates
 */
export async function runCli(adapter: PlatformAdapter, meta: CliMeta): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string", default: "." },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      fix: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
    },
  });

  const command = positionals[0] ?? "init";
  if (values.help || command === "help") {
    process.stdout.write(help(meta.binName));
    return 0;
  }

  const root = resolve(values.root);
  if (command === "init") return doInit(adapter, meta, root, values.yes);
  if (command === "doctor") {
    if (values.fix) return doDoctorFix(adapter, meta, root, values.write);
    return doDoctor(adapter, meta, root);
  }
  if (command === "update") return doUpdate(adapter, meta, root, values.write);

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

  const written: WriteResult[] = scaffold({ root, adapter, stack, answers, toolVersion: meta.version });

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

/**
 * `doctor --fix` — deterministic broken-relative-link repair. Dry-run by
 * default (previews proposed repairs); `--write` applies them. Unfixable links
 * are left as findings, so a follow-up `doctor` keeps failing on them.
 */
function doDoctorFix(adapter: PlatformAdapter, meta: CliMeta, root: string, write: boolean): number {
  intro(`${meta.binName} doctor --fix${write ? " --write" : ""}`);
  log.step(`${write ? "Repairing" : "Checking"} broken relative links in ${root} (${meta.toolName})`);

  const fix = fixLinks(root, adapter, { write });

  if (fix.fixes.length === 0 && fix.unfixable.length === 0) {
    log.success("No broken relative links found.");
    outro("Healthy.");
    return 0;
  }

  if (fix.fixes.length > 0) {
    const lines = fix.fixes.map(
      (f) => `${write ? "fixed" : "would fix"} [${f.class}] ${f.file}: ${f.oldTarget} -> ${f.newTarget}`,
    );
    note(lines.join("\n"), write ? "Repaired links" : "Proposed repairs (dry-run)");
  }
  if (fix.unfixable.length > 0) {
    const lines = fix.unfixable.map((u) => `x ${u.file}: ${u.target} (no unique target found)`);
    note(lines.join("\n"), "Unfixable links — repair manually");
  }

  if (!write) {
    log.warn(`${fix.fixes.length} repairable, ${fix.unfixable.length} unfixable. Re-run with --write to apply.`);
    outro("Dry-run — nothing written.");
    return 0;
  }

  log.success(`Applied ${fix.fixes.length} link repair(s).`);
  const after = runDoctor(root, adapter);
  if (after.errorCount > 0) {
    log.error(`${after.errorCount} error(s) remain (incl. ${fix.unfixable.length} unfixable link(s)).`);
    outro("Doctor still found errors.");
    return 1;
  }
  outro("Healthy.");
  return 0;
}

/**
 * `update` — deterministic, no-LLM migration of an already-initialized repo to
 * the current `core` templates. Dry-run by default (previews additive/updated
 * changes); `--write` applies them. Drifted (user-edited) and orphaned files are
 * reported, never clobbered or deleted.
 *
 * On `--write` in an interactive terminal, real conflicts (R-040) are resolved
 * through the `@clack/prompts` form (R-041): we classify first (dry-run), let the
 * user pick mine/theirs per conflict, then apply with those resolutions. In a
 * non-interactive run (no TTY) conflicts stay reported and untouched, as before.
 */
async function doUpdate(adapter: PlatformAdapter, meta: CliMeta, root: string, write: boolean): Promise<number> {
  intro(`${meta.binName} update${write ? " --write" : ""}`);
  log.step(`${write ? "Migrating" : "Checking"} ${root} against current templates (${meta.toolName})`);

  // Classify first without writing, so we can surface conflicts to the
  // interactive resolver before anything touches disk.
  const classified = runUpdate(root, adapter, { write: false, toolVersion: meta.version });

  if (classified.fatal) {
    log.error(classified.fatal);
    outro("Nothing to update.");
    return 1;
  }

  // On --write in a TTY, resolve conflicts interactively, then re-run with --write
  // and the collected resolutions. Otherwise the write pass mirrors the dry run.
  let report: UpdateReport = classified;
  if (write) {
    const conflicts = classified.items.filter((i) => i.action === "conflict" && i.conflict);
    let resolutions: Record<string, string> | undefined;
    if (conflicts.length > 0 && process.stdout.isTTY) {
      log.warn(`${conflicts.length} file(s) have conflicts with the upstream template — let's resolve them.`);
      resolutions = await resolveConflicts(
        conflicts.map((c) => ({ rel: c.rel, regions: c.conflict!.regions, count: c.conflict!.count })),
      );
    }
    report = runUpdate(root, adapter, { write: true, toolVersion: meta.version, resolutions });
  }

  // Version awareness (R-038): report scaffolded → running, warn on a downgrade.
  const v = report.version;
  if (v) {
    const arrow = `${v.scaffolded ?? "unknown"} -> ${v.running ?? "unknown"}`;
    if (v.direction === "downgrade") {
      log.warn(
        `This repo was scaffolded with a newer version than you're running (${arrow}). Migrating may revert newer templates — consider upgrading ${meta.binName} first.`,
      );
    } else if (v.direction === "upgrade") {
      log.step(`Migrating ${arrow} (scaffolded -> running).`);
    } else if (v.direction === "same") {
      log.step(`Running the same version that scaffolded this repo (${v.running}).`);
    } else {
      log.step(`Version: scaffolded ${v.scaffolded ?? "unknown"}, running ${v.running ?? "unknown"}.`);
    }
  }

  const { create, update, merge, conflict, drift, orphan, unchanged } = report.counts;
  const actionable = report.items.filter((i) => i.action !== "unchanged");

  if (actionable.length === 0) {
    log.success(`Already up to date (${unchanged} file(s) match current templates).`);
    outro("Healthy.");
    return 0;
  }

  const symbol: Record<string, string> = {
    create: write ? "+" : "would create",
    update: write ? "~" : "would update",
    merge: write ? "⇄" : "would merge",
    conflict: "✗",
    drift: "!",
    orphan: "·",
  };
  const lines = actionable.map(
    (i) => `${symbol[i.action]} [${i.action}] ${i.rel}${i.detail ? ` (${i.detail})` : ""}`,
  );
  note(lines.join("\n"), write ? "Applied" : "Proposed changes (dry-run)");

  if (!write) {
    log.warn(
      `${create} to create, ${update} to update, ${merge} to merge, ${conflict} conflict(s), ${drift} drifted (skipped), ${orphan} orphaned. Re-run with --write to apply.`,
    );
    if (conflict > 0) {
      log.step("Run `update --write` in an interactive terminal to resolve conflicts (keep mine / take theirs) per conflict.");
    }
    outro("Dry-run — nothing written.");
    return 0;
  }

  log.success(
    `Applied: ${create} created, ${update} updated, ${merge} merged. ${conflict} conflict(s), ${drift} drifted, ${orphan} orphaned (left in place).`,
  );
  if (conflict > 0 || drift > 0 || orphan > 0) {
    note(
      "Conflicted files have upstream changes that clash with your edits and were left untouched — reconcile them by hand. Drifted files carry edits with no mergeable upstream delta; orphaned files are no longer part of the scaffold.",
      "Review",
    );
  }
  outro("Migration complete.");
  return 0;
}

function help(binName: string): string {
  return `${binName} — QA-process orchestration scaffolder

Usage:
  npx ${binName} [command] [options]

Commands:
  init            Detect the test stack, run the wizard, and scaffold the QA orchestration (default)
  doctor          Validate an existing scaffold (structure, manifest, placeholders, links, iron QA rule)
  update          Migrate an existing scaffold to the current templates (additive + pristine-file refresh; never clobbers edits)

Options:
  --root <dir>    Target project directory (default: current directory)
  -y, --yes       (init) Skip the wizard and accept detected defaults (non-interactive / CI)
  --fix           (doctor) Repair broken relative links deterministically; dry-run preview by default
  --write         (doctor --fix / update) Apply the proposed changes (otherwise dry-run only)
  -h, --help      Show this help
`;
}

function rel(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, "") : abs;
}
