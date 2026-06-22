import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { repoMapMarkdown } from "../detect/repo-map.js";
import { SKILLS } from "../model/skills.js";
import { render } from "../render.js";
import { buildVars, hashContent, MANIFEST_REL, scaffoldFiles } from "../scaffold/index.js";
import type { ScaffoldManifest } from "../types.js";

/**
 * What `update` decided for a single expected file.
 *
 * - `create`   — absent on disk; the current template is written (additive; safe).
 * - `update`   — present and *pristine* (byte-identical to the recorded baseline,
 *                so untouched by the user), but the current template differs;
 *                refreshed to the new template (safe).
 * - `drift`    — present and modified (user edit or filled-in phase-2 placeholders,
 *                or no baseline hash from a pre-R-034 scaffold); reported, never
 *                clobbered.
 * - `orphan`   — recorded in the manifest baseline but no longer part of the
 *                scaffold (e.g. a renamed/removed skill); reported, never deleted.
 * - `unchanged`— already byte-identical to the current template; nothing to do.
 */
export type UpdateAction = "create" | "update" | "drift" | "orphan" | "unchanged";

export interface UpdateItem {
  /** Root-relative POSIX path. */
  rel: string;
  action: UpdateAction;
  /** Short human reason, e.g. why a differing file is drift vs. update. */
  detail?: string;
}

/**
 * How the version that scaffolded the repo relates to the running tool.
 *
 * - `same`      — identical versions.
 * - `upgrade`   — running a newer tool than scaffolded (the normal `update`).
 * - `downgrade` — running an older tool; migrating would revert newer templates.
 * - `unknown`   — either side is missing (pre-R-038 manifest, or no running
 *                 version supplied) or a version string is unparseable.
 */
export type VersionDirection = "same" | "upgrade" | "downgrade" | "unknown";

export interface VersionInfo {
  /** `manifest.toolVersion` — what last wrote this scaffold (R-038). */
  scaffolded?: string;
  /** The running package version, as supplied by the CLI. */
  running?: string;
  direction: VersionDirection;
}

/**
 * Compare two `X.Y.Z[-pre]` version strings numerically by release component
 * (pre-release/build suffixes are ignored). Returns -1 / 0 / 1, or `null` when
 * either string isn't a parseable dotted-integer version.
 */
export function compareToolVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa === null || pb === null) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function parseVersion(v: string): number[] | null {
  const release = v.trim().split(/[-+]/)[0] ?? "";
  const parts = release.split(".");
  if (parts.length === 0 || parts[0] === "") return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return nums;
}

function versionInfo(scaffolded: string | undefined, running: string | undefined): VersionInfo {
  if (scaffolded === undefined || running === undefined) {
    return { scaffolded, running, direction: "unknown" };
  }
  const cmp = compareToolVersions(scaffolded, running);
  const direction: VersionDirection =
    cmp === null ? "unknown" : cmp === 0 ? "same" : cmp < 0 ? "upgrade" : "downgrade";
  return { scaffolded, running, direction };
}

export interface UpdateReport {
  mode: "dry-run" | "write";
  platform: string;
  items: UpdateItem[];
  counts: Record<UpdateAction, number>;
  /**
   * (R-038) How the scaffolded version relates to the running tool. Present on
   * every non-fatal report; the CLI surfaces it as `scaffolded X → running Y`
   * and warns on a downgrade.
   */
  version?: VersionInfo;
  /**
   * Set when the target can't be migrated at all (no/invalid manifest, or the
   * manifest was generated for a different platform). When set, `items` is empty
   * and nothing is written.
   */
  fatal?: string;
}

/**
 * Deterministic, no-LLM migration of an already-initialized repo to the current
 * `core` templates — the sibling of `init`/`doctor`. It diffs the live scaffold
 * against what the current templates would produce (re-rendered with the saved
 * stack/choices from the manifest) and **applies additive/updated changes without
 * clobbering filled-in placeholders or user edits**: new skills, guidelines, MCP
 * wiring and root-config rules reach repos that ran an older version, while any
 * file the user touched is reported, not overwritten.
 *
 * Dry-run by default; `opts.write` applies `create` + `update` actions and
 * refreshes the manifest baseline. Mirrors the `doctor --fix` / auditskill
 * `apply-step` dry-run/write contract.
 */
export function runUpdate(
  root: string,
  adapter: PlatformAdapter,
  opts: { write?: boolean; toolVersion?: string } = {},
): UpdateReport {
  const write = opts.write === true;
  const mode = write ? "write" : "dry-run";
  const emptyCounts: Record<UpdateAction, number> = {
    create: 0,
    update: 0,
    drift: 0,
    orphan: 0,
    unchanged: 0,
  };

  const manifestAbs = join(root, MANIFEST_REL);
  if (!existsSync(manifestAbs)) {
    return {
      mode,
      platform: adapter.id,
      items: [],
      counts: { ...emptyCounts },
      fatal: `No scaffold found (${MANIFEST_REL} is missing). Run \`init\` first.`,
    };
  }

  let manifest: ScaffoldManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, "utf8")) as ScaffoldManifest;
  } catch {
    return {
      mode,
      platform: adapter.id,
      items: [],
      counts: { ...emptyCounts },
      fatal: `${MANIFEST_REL} is not valid JSON — cannot migrate. Re-run \`init\` or restore it.`,
    };
  }

  if (manifest.platform !== adapter.id) {
    return {
      mode,
      platform: adapter.id,
      items: [],
      counts: { ...emptyCounts },
      fatal: `Scaffold was generated for "${manifest.platform}", but you ran the ${adapter.id} update. Use the ${manifest.platform} package.`,
    };
  }

  const version = versionInfo(manifest.toolVersion, opts.toolVersion);

  // Reproduce the original phase-1 vars from the manifest. Reusing the recorded
  // generatedAt is what makes unchanged templates render byte-identical (so they
  // classify as `unchanged`, not churn), leaving only genuine template changes.
  // The repo-map inventory (R-037) is re-walked fresh from the repo — "always
  // fresh": on a pristine repo-map it refreshes to match the current layout; a
  // phase-2-enriched repo-map is drift and is preserved untouched, as ever.
  const vars = buildVars(manifest.stack, manifest.choices, manifest.generatedAt, repoMapMarkdown(root));
  const baseline = manifest.files ?? {};
  const expected = scaffoldFiles(adapter, manifest.stack, manifest.choices);
  const expectedRels = new Set(expected.map((f) => f.rel));

  const items: UpdateItem[] = [];
  const writes: { abs: string; content: string }[] = [];
  const newBaseline: Record<string, string> = {};

  for (const f of expected) {
    const rendered = render(f.content, vars);
    const renderedHash = hashContent(rendered);
    const abs = join(root, f.rel);

    if (!existsSync(abs)) {
      items.push({ rel: f.rel, action: "create" });
      writes.push({ abs, content: rendered });
      newBaseline[f.rel] = renderedHash;
      continue;
    }

    const onDisk = readFileSync(abs, "utf8");
    if (onDisk === rendered) {
      items.push({ rel: f.rel, action: "unchanged" });
      newBaseline[f.rel] = renderedHash;
      continue;
    }

    // Content differs. Refresh only when we can prove the file is pristine —
    // i.e. byte-identical to the baseline we last wrote. Otherwise it carries
    // user edits or filled-in phase-2 work, so we report drift and leave it.
    const baseHash = baseline[f.rel];
    const pristine = baseHash !== undefined && hashContent(onDisk) === baseHash;
    if (pristine) {
      items.push({ rel: f.rel, action: "update", detail: "template changed; file pristine" });
      writes.push({ abs, content: rendered });
      newBaseline[f.rel] = renderedHash;
    } else {
      items.push({
        rel: f.rel,
        action: "drift",
        detail: baseHash === undefined ? "no baseline hash (pre-R-034 scaffold)" : "user-modified",
      });
      // Preserve the prior baseline so it keeps reporting drift until resolved.
      if (baseHash !== undefined) newBaseline[f.rel] = baseHash;
    }
  }

  // Files we used to manage that are no longer part of the scaffold and still
  // exist on disk — reported, never deleted (they may hold user content).
  for (const rel of Object.keys(baseline)) {
    if (expectedRels.has(rel)) continue;
    if (existsSync(join(root, rel))) {
      items.push({ rel, action: "orphan", detail: "no longer part of the scaffold; left in place" });
    }
  }

  if (write) {
    for (const w of writes) {
      mkdirSync(dirname(w.abs), { recursive: true });
      writeFileSync(w.abs, w.content, "utf8");
    }
    const updated: ScaffoldManifest = {
      ...manifest,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      // Record the version that produced the now-on-disk files; preserve the
      // prior value when the CLI didn't supply one (e.g. a direct test call).
      ...(opts.toolVersion ? { toolVersion: opts.toolVersion } : {}),
      skills: SKILLS.map((s) => s.name),
      files: newBaseline,
    };
    writeFileSync(manifestAbs, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  }

  const counts = { ...emptyCounts };
  for (const it of items) counts[it.action]++;
  return { mode, platform: adapter.id, items, counts, version };
}
