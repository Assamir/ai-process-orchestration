import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlatformAdapter } from "../adapters/types.js";
import { repoMapMarkdown } from "../detect/repo-map.js";
import { SKILLS } from "../model/skills.js";
import { render } from "../render.js";
import { buildVars, fileBaseline, hashContent, MANIFEST_REL, scaffoldFiles } from "../scaffold/index.js";
import type { FileBaseline, ScaffoldManifest } from "../types.js";
import { merge3 } from "./merge.js";

/**
 * What `update` decided for a single expected file.
 *
 * - `create`   — absent on disk; the current template is written (additive; safe).
 * - `update`   — present and *pristine* (identical to the recorded baseline — by
 *                content for R-039+ manifests, by sha256 for older hash-only ones,
 *                so untouched by the user), but the current template differs;
 *                refreshed to the new template (safe).
 * - `merge`    — (R-040) present and user-edited, AND the template changed since
 *                the recorded base; the upstream delta (base → template) merged
 *                cleanly onto the local edits via a 3-way merge → applied on
 *                `--write`. Needs the R-039 base *content* to compute the delta.
 * - `conflict` — (R-040) like `merge`, but the upstream delta and the local edits
 *                touch the same region and differ; reported, **never written** in
 *                R-040 (R-041 adds interactive resolution).
 * - `drift`    — present and modified, but not mergeable: no recorded base content
 *                (pre-R-039 hash-only or pre-R-034 absent baseline), or the template
 *                didn't change so there is nothing to merge; reported, never clobbered.
 * - `orphan`   — recorded in the manifest baseline but no longer part of the
 *                scaffold (e.g. a renamed/removed skill); reported, never deleted.
 * - `unchanged`— already byte-identical to the current template; nothing to do.
 */
export type UpdateAction = "create" | "update" | "merge" | "conflict" | "drift" | "orphan" | "unchanged";

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

/** A manifest baseline entry normalized across its historical shapes (R-039). */
interface NormalizedBaseline {
  /** sha256 fingerprint — always present. */
  hash: string;
  /** The rendered base content — present only for R-039+ object baselines. */
  content?: string;
}

/**
 * Read a `manifest.files` entry regardless of its on-disk shape: an R-039+
 * `{ hash, content }` object, an R-034..R-038 bare sha256 string (hash only), or
 * absent (pre-R-034 → `undefined`). Lets the rest of `update` treat the baseline
 * uniformly while preferring the richer content form when it exists.
 */
function readBaseline(entry: string | FileBaseline | undefined): NormalizedBaseline | undefined {
  if (entry === undefined) return undefined;
  if (typeof entry === "string") return { hash: entry };
  return { hash: entry.hash, content: entry.content };
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
    merge: 0,
    conflict: 0,
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
  const newBaseline: Record<string, string | FileBaseline> = {};

  for (const f of expected) {
    const rendered = render(f.content, vars);
    const abs = join(root, f.rel);

    if (!existsSync(abs)) {
      items.push({ rel: f.rel, action: "create" });
      writes.push({ abs, content: rendered });
      newBaseline[f.rel] = fileBaseline(rendered);
      continue;
    }

    const onDisk = readFileSync(abs, "utf8");
    if (onDisk === rendered) {
      items.push({ rel: f.rel, action: "unchanged" });
      newBaseline[f.rel] = fileBaseline(rendered);
      continue;
    }

    // Content differs. Refresh only when we can prove the file is pristine —
    // i.e. identical to the base we last wrote. Prefer the recorded base
    // *content* (R-039) for a direct comparison; fall back to the sha256
    // fingerprint for pre-R-039 hash-only manifests. Otherwise the file carries
    // user edits or filled-in phase-2 work, so we report drift and leave it.
    const prev = baseline[f.rel];
    const base = readBaseline(prev);
    const pristine =
      base !== undefined &&
      (base.content !== undefined ? onDisk === base.content : hashContent(onDisk) === base.hash);
    if (pristine) {
      items.push({ rel: f.rel, action: "update", detail: "template changed; file pristine" });
      writes.push({ abs, content: rendered });
      newBaseline[f.rel] = fileBaseline(rendered);
      continue;
    }

    // The file is user-modified. When we have the recorded base *content*
    // (R-039) AND the template actually changed since that base, attempt a 3-way
    // merge (R-040): replay the upstream delta (base → template) onto the local
    // edits. Clean merges are applied; genuine conflicts are reported and left in
    // place (R-041 will resolve them interactively).
    if (base?.content !== undefined && base.content !== rendered) {
      const merged = merge3(onDisk, base.content, rendered);
      if (merged.clean) {
        if (merged.content === onDisk) {
          // The upstream change is already reflected locally — no write needed,
          // but advance the base so we're reconciled with this template version.
          items.push({ rel: f.rel, action: "merge", detail: "upstream changes already present" });
        } else {
          items.push({ rel: f.rel, action: "merge", detail: "merged upstream changes into local edits" });
          writes.push({ abs, content: merged.content });
        }
        newBaseline[f.rel] = fileBaseline(rendered);
      } else {
        items.push({
          rel: f.rel,
          action: "conflict",
          detail: `${merged.conflicts} conflict(s) with upstream; left in place — resolve manually`,
        });
        // Preserve the prior baseline so it keeps reporting until resolved.
        if (prev !== undefined) newBaseline[f.rel] = prev;
      }
      continue;
    }

    // Not mergeable: no recorded base content (legacy/absent baseline), or the
    // template didn't change so there's nothing to merge. Classic drift — report,
    // never clobber.
    items.push({
      rel: f.rel,
      action: "drift",
      detail: base === undefined ? "no baseline (pre-R-034 scaffold)" : "user-modified",
    });
    // Preserve the prior baseline entry verbatim so it keeps reporting drift
    // until resolved (a legacy hash stays a hash; a content base stays content).
    if (prev !== undefined) newBaseline[f.rel] = prev;
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
