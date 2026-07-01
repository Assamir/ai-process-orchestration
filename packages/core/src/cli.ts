import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { intro, log, note, outro } from "@clack/prompts";
import type { PlatformAdapter } from "./adapters/types.js";
import { detectStack } from "./detect/index.js";
import { enumerateRepos, hasDedicatedTestRepo } from "./detect/repo-map.js";
import { fixLinks, runDoctor, type TokenReport } from "./doctor/index.js";
import { scaffold } from "./scaffold/index.js";
import type { WorkspaceInfo, WriteResult } from "./types.js";
import type { Changelog, ChangelogKind } from "./update/changelog.js";
import { runUpdate, type UpdateItem, type UpdateReport } from "./update/index.js";
import { type ChangeItem, resolveConflicts, walkChanges } from "./update/resolve.js";
import {
  defaultAnswers,
  defaultWorkspace,
  resolveEmbeddedWorkspace,
  runEmbeddedWizard,
  runWizard,
  runWorkspaceWizard,
} from "./wizard/index.js";

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
      interactive: { type: "boolean", short: "i", default: false },
      // (R-096) Embedded test topology: the writable test subtree inside a host repo,
      // and (multi-host) which developer repo hosts it. Providing --test-subpath is
      // the only way to activate embedded mode under --yes/CI (compat invariant).
      "test-subpath": { type: "string" },
      "test-host": { type: "string" },
    },
  });

  const command = positionals[0] ?? "init";
  if (values.help || command === "help") {
    process.stdout.write(help(meta.binName));
    return 0;
  }

  const root = resolve(values.root);
  if (command === "init")
    return doInit(adapter, meta, root, values.yes, {
      testSubpath: values["test-subpath"],
      testHost: values["test-host"],
    });
  if (command === "doctor") {
    if (values.fix) return doDoctorFix(adapter, meta, root, values.write);
    return doDoctor(adapter, meta, root);
  }
  if (command === "update") return doUpdate(adapter, meta, root, values.write, values.interactive);

  process.stderr.write(`Unknown command: ${command}\n\n${help(meta.binName)}`);
  return 1;
}

async function doInit(
  adapter: PlatformAdapter,
  meta: CliMeta,
  root: string,
  yes: boolean,
  embedded: { testSubpath?: string; testHost?: string },
): Promise<number> {
  intro(meta.binName);
  log.step(`Scanning ${root}`);

  // (R-083) Multi-repo workspace: if the scan root is a *parent* holding ≥2
  // qualifying repos, pick the test repo (the write root) and the read-only
  // developer repos before detecting the stack. With <2 candidates this is a
  // single repo and every step below behaves exactly as it always has.
  const candidates = enumerateRepos(root);
  let writeRoot = root;
  let workspace: WorkspaceInfo | undefined;

  if (embedded.testSubpath) {
    // (R-096) Explicit embedded override — the only way into embedded mode under
    // --yes/CI, and honored in interactive runs too. Builds + validates the
    // workspace from the flags; a bad subpath/host is a hard error.
    const resolved = resolveEmbeddedWorkspace({
      root,
      testSubpath: embedded.testSubpath,
      testHost: embedded.testHost,
      candidates,
    });
    if ("error" in resolved) {
      log.error(resolved.error);
      outro("Nothing was written.");
      return 1;
    }
    workspace = resolved.workspace;
  } else if (candidates.length >= 2) {
    // (R-095/D5) Parent folder. A **dedicated** test repo wins (R-083); embedded is
    // the fallback, offered interactively only when no repo's name marks it as the
    // test repo. --yes/CI never activates embedded (compat invariant): it always
    // takes the deterministic dedicated pick, exactly as before.
    if (yes || hasDedicatedTestRepo(candidates)) {
      const picked = yes ? defaultWorkspace(candidates) : await runWorkspaceWizard(candidates);
      if (picked === null) return 0; // user cancelled
      workspace = picked;
    } else {
      const emb = await runEmbeddedWizard({ root, candidates });
      if (emb) {
        workspace = emb;
      } else {
        const picked = await runWorkspaceWizard(candidates);
        if (picked === null) return 0; // user cancelled
        workspace = picked;
      }
    }
  } else if (!yes) {
    // (R-095) Single repo at root, interactive: offer single-host embedded when a
    // test subtree is detected. Declining keeps ordinary single-repo behavior.
    const emb = await runEmbeddedWizard({ root, candidates: [] });
    if (emb) workspace = emb;
  }

  if (workspace) {
    writeRoot = workspace.testRepo === "." ? root : join(root, workspace.testRepo);
    if (workspace.testSubpath) {
      const hostLabel = workspace.testRepo === "." ? "this repo" : workspace.testRepo;
      log.step(
        `Embedded: writable subtree ${workspace.testSubpath}/ in ${hostLabel} · read-only: ${
          workspace.devRepos.join(", ") || "host source"
        }`,
      );
    } else {
      log.step(
        `Test repo: ${workspace.testRepo} · developer repos (read-only): ${workspace.devRepos.join(", ") || "none"}`,
      );
    }
  }

  // Detect the stack on the *test repo* (the write root) — it drives the
  // automation framework and the result-MCP wiring.
  const stack = detectStack(writeRoot);
  if (stack.language === null) {
    log.warn("No supported build manifest found (Node/Java/Python). Continuing with generic defaults.");
  }

  const answers = yes ? defaultAnswers(stack) : await runWizard(stack, workspace);
  if (answers === null) return 0; // user cancelled

  const written: WriteResult[] = scaffold({
    root,
    writeRoot,
    workspace,
    adapter,
    stack,
    answers,
    toolVersion: meta.version,
  });

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

  // (R-081) Token footprint — always shown, so leanness is a measured, visible
  // invariant (not just a warn when something is over budget).
  note(footprintLines(report.tokens).join("\n"), "Token footprint");

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
 * changes); `--write` applies them in bulk; `--interactive` (R-043) steps through
 * each change one file at a time (apply / skip / diff). Drifted (user-edited) and
 * orphaned files are reported, never clobbered or deleted.
 *
 * On `--write` in an interactive terminal, real conflicts (R-040) are resolved
 * through the `@clack/prompts` form (R-041): we classify first (dry-run), let the
 * user pick mine/theirs per conflict, then apply with those resolutions. In a
 * non-interactive run (no TTY) conflicts stay reported and untouched. With
 * `--interactive` the same walk also asks apply/skip per create/update/merge
 * file, so a large migration can be reviewed file by file (R-043). `--interactive`
 * requires a TTY; without one it falls back to a dry-run preview.
 */
async function doUpdate(
  adapter: PlatformAdapter,
  meta: CliMeta,
  root: string,
  write: boolean,
  interactive: boolean,
): Promise<number> {
  const interactiveTTY = interactive && Boolean(process.stdout.isTTY);
  const wantWrite = write || interactiveTTY;
  const modeLabel = interactive ? " --interactive" : write ? " --write" : "";
  intro(`${meta.binName} update${modeLabel}`);
  log.step(`${wantWrite ? "Migrating" : "Checking"} ${root} against current templates (${meta.toolName})`);

  // Classify first without writing, so we can surface changes to the interactive
  // walk / conflict resolver before anything touches disk.
  const classified = runUpdate(root, adapter, { write: false, toolVersion: meta.version });

  if (classified.fatal) {
    log.error(classified.fatal);
    outro("Nothing to update.");
    return 1;
  }

  if (interactive && !interactiveTTY) {
    log.warn("--interactive needs an interactive terminal; showing a dry-run preview instead.");
  }

  // The actionable kinds the interactive walk steps through. `drift`/`orphan` are
  // informational (never applied), so they're reported but not walked.
  const isWalkable = (i: UpdateItem): boolean =>
    i.action === "create" || i.action === "update" || i.action === "merge" || i.action === "conflict";

  let report: UpdateReport = classified;
  if (interactiveTTY && classified.items.some(isWalkable)) {
    // R-043: file-by-file walk — apply/skip/diff per create/update/merge, and
    // region-level resolution per conflict, all in one document-order pass.
    const changes: ChangeItem[] = classified.items.filter(isWalkable).map((i) => ({
      rel: i.rel,
      action: i.action as ChangeItem["action"],
      detail: i.detail,
      preview: i.preview,
      conflict: i.conflict,
    }));
    const { apply, resolutions } = await walkChanges(changes);
    report = runUpdate(root, adapter, { write: true, toolVersion: meta.version, apply, resolutions });
  } else if (write) {
    // Bulk write (R-040/R-041): resolve conflicts via the form, then write all.
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

  // Template changelog (R-042): what changed upstream between the scaffolded and
  // running versions — independent of the user's edits. Shown before the
  // repo-side plan so the user sees "what's new" before "what happens to me".
  const cl = report.changelog;
  if (cl && cl.entries.length > 0) {
    note(changelogLines(cl).join("\n"), "Template changes (upstream delta)");
  }

  // Whether anything was actually written (true for bulk-write and an interactive
  // walk that touched ≥1 file; false for dry-run / no-TTY / nothing-to-walk).
  const wrote = report.mode === "write";
  const applied = (a: UpdateItem["action"]): number =>
    report.items.filter((i) => i.action === a && !i.skipped).length;
  const create = applied("create");
  const update = applied("update");
  const merge = applied("merge");
  const { conflict, drift, orphan, unchanged } = report.counts;
  const skipped = report.items.filter((i) => i.skipped).length;
  const actionable = report.items.filter((i) => i.action !== "unchanged");

  if (actionable.length === 0) {
    log.success(`Already up to date (${unchanged} file(s) match current templates).`);
    outro("Healthy.");
    return 0;
  }

  const symbol: Record<string, string> = {
    create: wrote ? "+" : "would create",
    update: wrote ? "~" : "would update",
    merge: wrote ? "⇄" : "would merge",
    conflict: "✗",
    drift: "!",
    orphan: "·",
  };
  const lines = actionable.map((i) =>
    i.skipped
      ? `· [skipped] ${i.rel} (${i.action})`
      : `${symbol[i.action]} [${i.action}] ${i.rel}${i.detail ? ` (${i.detail})` : ""}`,
  );
  note(lines.join("\n"), wrote ? "Applied" : "Proposed changes (dry-run)");

  if (!wrote) {
    log.warn(
      `${create} to create, ${update} to update, ${merge} to merge, ${conflict} conflict(s), ${drift} drifted (skipped), ${orphan} orphaned. Re-run with --write (or --interactive) to apply.`,
    );
    if (conflict > 0) {
      log.step("Run `update --write` in an interactive terminal to resolve conflicts (keep mine / take theirs) per conflict.");
    }
    if (create + update + merge > 0) {
      log.step("Run `update --interactive` to step through each change (apply / skip / diff) one file at a time.");
    }
    outro("Dry-run — nothing written.");
    return 0;
  }

  log.success(
    `Applied: ${create} created, ${update} updated, ${merge} merged.${skipped > 0 ? ` ${skipped} skipped.` : ""} ${conflict} conflict(s), ${drift} drifted, ${orphan} orphaned (left in place).`,
  );
  if (conflict > 0 || drift > 0 || orphan > 0 || skipped > 0) {
    note(
      "Conflicted files have upstream changes that clash with your edits and were left untouched — reconcile them by hand. Drifted files carry edits with no mergeable upstream delta; orphaned files are no longer part of the scaffold. Skipped files (interactive) were left as-is and will be offered again next run.",
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
  --test-subpath <path>  (init) Embedded topology: the writable test subtree inside the host repo (required to activate embedded mode under --yes)
  --test-host <repo>     (init) Embedded multi-host: the developer repo that hosts the test subtree
  --fix           (doctor) Repair broken relative links deterministically; dry-run preview by default
  --write         (doctor --fix / update) Apply the proposed changes (otherwise dry-run only)
  -i, --interactive  (update) Step through each change file by file (apply / skip / diff); requires a TTY
  -h, --help      Show this help
`;
}

function rel(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]/, "") : abs;
}

/**
 * (R-081) Render the token footprint as a compact, always-shown summary: the
 * tokenizer used, the always-resident root map, the largest + total guideline and
 * skill footprint, and the grand total against its budget. `!` marks a line over
 * budget (mirrors the finding severity). Keeps the strategic number — the lean
 * root map — first.
 */
function footprintLines(t: TokenReport): string[] {
  const of = (kind: "rootmap" | "guideline" | "skill") => t.entries.filter((e) => e.kind === kind);
  const sum = (kind: "rootmap" | "guideline" | "skill") => of(kind).reduce((n, e) => n + e.tokens, 0);
  const max = (kind: "guideline" | "skill") => {
    const list = of(kind);
    return list.length > 0 ? list.reduce((a, b) => (b.tokens > a.tokens ? b : a)) : null;
  };
  const flag = (over: boolean) => (over ? "! " : "  ");
  const root = of("rootmap")[0];
  const gMax = max("guideline");
  const sMax = max("skill");
  const lines = [`Tokenizer: ${t.tokenizer}`];
  if (root) lines.push(`${flag(root.overBudget)}root map: ${root.tokens} (budget ${root.budget})`);
  if (gMax) {
    lines.push(
      `${flag(gMax.overBudget)}guidelines: ${sum("guideline")} total, largest ${gMax.name} ${gMax.tokens} (budget ${gMax.budget})`,
    );
  }
  if (sMax) {
    lines.push(
      `${flag(sMax.overBudget)}skills: ${sum("skill")} total, largest ${sMax.name} ${sMax.tokens} (budget ${sMax.budget})`,
    );
  }
  lines.push(`${flag(t.overBudget)}total: ${t.total} (budget ${t.totalBudget})`);
  return lines;
}

/**
 * Render the template changelog (R-042) as a compact, grouped summary: a header
 * naming the version window, then one line per artifact kind listing
 * `+ added` / `~ changed` / `- removed` names. Skill/guideline entries show
 * their logical name; plain files show their path.
 */
function changelogLines(cl: Changelog): string[] {
  const sym: Record<string, string> = { added: "+", changed: "~", removed: "-" };
  const labels: Record<ChangelogKind, string> = {
    skill: "Skills",
    guideline: "Guidelines",
    file: "Files",
  };
  const header = `Upstream template delta ${cl.fromVersion ?? "unknown"} -> ${cl.toVersion ?? "unknown"}:`;
  const lines = [header];
  for (const kind of ["skill", "guideline", "file"] as ChangelogKind[]) {
    const inKind = cl.entries.filter((e) => e.kind === kind);
    if (inKind.length === 0) continue;
    const items = inKind.map((e) => `${sym[e.change]} ${e.name ?? e.rel}`).join(", ");
    lines.push(`  ${labels[kind]}: ${items}`);
  }
  return lines;
}
