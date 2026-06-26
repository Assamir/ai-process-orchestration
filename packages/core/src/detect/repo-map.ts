import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * R-037 — the deterministic, no-LLM **phase-1 path inventory** that seeds
 * `context/foundation/repo-map.md`. It gives the agent a *map* of a large or
 * multi-module/polyglot repo — where the build roots, test directories, and
 * test/CI configs live — so it locates the right place fast instead of
 * blind-searching. Phase 2 (`qa-reverse-engineer`) enriches it with the
 * semantic test↔source links and entry points.
 *
 * Light, presence-based scanning in the spirit of `detect/` — no parsing of
 * source. Bounded (skips noise dirs, depth-capped) and fully deterministic
 * (every list is sorted), so re-running on an unchanged repo yields identical
 * output and `update` (R-034) sees no churn.
 */

export interface RepoInventory {
  /** Directories holding a build manifest — the module roots of the repo. */
  modules: Array<{ dir: string; manifest: string }>;
  /** Directories that hold tests (by name or by containing test files). */
  testDirs: string[];
  /** Notable test-framework / CI configuration files. */
  configs: string[];
}

/** Directories never worth walking — build output, caches, vendored deps, VCS. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".gradle",
  ".mvn",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".tox",
  ".mypy_cache",
  ".ruff_cache",
  "coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".idea",
  "vendor",
  "site-packages",
  "playwright-report",
  "test-results",
  "allure-results",
  "allure-report",
]);

/** Build manifests that mark a module root, mapped to a short label. */
const MODULE_MANIFESTS: Record<string, string> = {
  "package.json": "package.json",
  "pom.xml": "pom.xml",
  "build.gradle": "build.gradle",
  "build.gradle.kts": "build.gradle.kts",
  "build.sbt": "build.sbt",
  "pyproject.toml": "pyproject.toml",
  "setup.py": "setup.py",
  "go.mod": "go.mod",
  "Cargo.toml": "Cargo.toml",
};

/** Directory names that, by convention, hold tests. */
const TEST_DIR_NAMES = new Set([
  "test",
  "tests",
  "e2e",
  "spec",
  "specs",
  "__tests__",
  "it",
  "integration",
  "integration-tests",
  "acceptance",
  "functional-tests",
]);

/** A file is a test if its name matches one of these patterns. */
const TEST_FILE_RE =
  /(\.spec\.[jt]sx?$|\.test\.[jt]sx?$|_spec\.rb$|^test_.*\.py$|.*_test\.py$|Test\.java$|Tests\.java$|IT\.java$|\.feature$)/;

/** Test-framework + CI config filenames worth surfacing as navigation anchors. */
const CONFIG_FILE_RE =
  /^(playwright\.config\.[mc]?[jt]s|cypress\.config\.[mc]?[jt]s|jest\.config\.[mc]?[jt]s|jest\.config\.json|vitest\.config\.[mc]?[jt]s|wdio\.conf\.[jt]s|\.mocharc\.(json|ya?ml|js)|karma\.conf\.js|pytest\.ini|tox\.ini|setup\.cfg|conftest\.py|testng\.xml|junit-platform\.properties|cucumber\.ya?ml|\.gitlab-ci\.yml|azure-pipelines\.yml|Jenkinsfile|bitbucket-pipelines\.yml)$/;

const MAX_DEPTH = 6;
/** Per-section cap so the inventory stays a lean map, not a file dump. */
const MAX_ITEMS = 60;

/** Walk `root` (bounded, deterministic) and inventory its test surface ↔ source. */
export function buildRepoInventory(root: string): RepoInventory {
  const modules: Array<{ dir: string; manifest: string }> = [];
  const testDirs = new Set<string>();
  const configs = new Set<string>();
  let sawGithubWorkflows = false;

  const walk = (abs: string, depth: number): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }

    const dirRel = posixRel(root, abs);
    const baseName = abs.split(/[\\/]/).pop() ?? "";
    let dirHasTestFile = false;

    for (const e of entries) {
      if (e.isFile()) {
        if (MODULE_MANIFESTS[e.name]) {
          modules.push({ dir: dirRel === "" ? "." : dirRel, manifest: MODULE_MANIFESTS[e.name]! });
        }
        if (CONFIG_FILE_RE.test(e.name)) {
          configs.add(joinPosix(dirRel, e.name));
        }
        if (TEST_FILE_RE.test(e.name)) dirHasTestFile = true;
      }
    }

    // A directory is a test directory if its name is conventional or it holds tests.
    if (dirRel !== "" && (TEST_DIR_NAMES.has(baseName.toLowerCase()) || dirHasTestFile)) {
      testDirs.add(dirRel);
    }

    if (depth >= MAX_DEPTH) return;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      // `.github/workflows` is the GitHub Actions CI signal; other dotdirs are noise.
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (dirRel === "" && e.name === ".github") {
        if (hasDir(join(abs, e.name), "workflows")) sawGithubWorkflows = true;
      }
      walk(join(abs, e.name), depth + 1);
    }
  };

  walk(root, 0);
  if (sawGithubWorkflows) configs.add(".github/workflows/");

  return {
    modules: dedupeModules(modules).slice(0, MAX_ITEMS),
    testDirs: [...testDirs].sort().slice(0, MAX_ITEMS),
    configs: [...configs].sort().slice(0, MAX_ITEMS),
  };
}

/** Render the inventory as the markdown body for the phase-1 section. */
export function renderRepoInventory(inv: RepoInventory): string {
  const sections: string[] = [];

  sections.push("### Modules (build roots)\n" + bullets(
    inv.modules.map((m) => `\`${m.dir}\` — ${m.manifest}`),
    "No build manifests found below the repo root.",
  ));

  sections.push("### Test directories\n" + bullets(
    inv.testDirs.map((d) => `\`${d}\``),
    "No test directories detected — phase 2 should confirm where tests live.",
  ));

  sections.push("### Test & CI configuration\n" + bullets(
    inv.configs.map((c) => `\`${c}\``),
    "No test/CI config files detected.",
  ));

  return sections.join("\n\n");
}

/** Convenience: walk + render in one call (used by the scaffolder and `update`). */
export function repoMapMarkdown(root: string): string {
  return renderRepoInventory(buildRepoInventory(root));
}

function bullets(items: string[], emptyNote: string): string {
  if (items.length === 0) return `_${emptyNote}_`;
  return items.map((i) => `- ${i}`).join("\n");
}

/** A path can hold several manifests; keep the first label per dir, sorted by dir. */
function dedupeModules(
  modules: Array<{ dir: string; manifest: string }>,
): Array<{ dir: string; manifest: string }> {
  const byDir = new Map<string, string>();
  for (const m of modules) if (!byDir.has(m.dir)) byDir.set(m.dir, m.manifest);
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, manifest]) => ({ dir, manifest }));
}

function hasDir(parentAbs: string, name: string): boolean {
  try {
    return readdirSync(parentAbs, { withFileTypes: true }).some((e) => e.isDirectory() && e.name === name);
  } catch {
    return false;
  }
}

function posixRel(root: string, abs: string): string {
  return relative(root, abs).split("\\").join("/");
}

// --- R-083: multi-repo workspace enumeration --------------------------------
//
// `init --root <parent>` can be pointed at a **parent folder holding several git
// repos** — one "test repo" (where all orchestration artifacts land) and several
// read-only "developer repos" (application source). `enumerateRepos` lists the
// immediate sub-directories that qualify as a repo; `chooseTestRepo` picks the
// most test-like one deterministically for the non-interactive (`--yes`/CI) path.
// Multi-repo behavior activates only when ≥2 of these are found — otherwise every
// command behaves exactly as the single-root tool always has.

/** Name fragments that mark a sub-dir as the likely test repo (most-specific first). */
const TEST_REPO_HINTS = [
  "e2e",
  "qa",
  "test-automation",
  "test-automate",
  "automation",
  "acceptance",
  "integration-tests",
  "tests",
  "test",
];

/**
 * List the immediate sub-directories of `parent` that qualify as a sibling repo:
 * a directory that is itself a git repository (holds a `.git`) **or** carries a
 * build manifest ({@link MODULE_MANIFESTS}) directly inside it. Noise directories
 * ({@link SKIP_DIRS}) are skipped. The result is sorted, so enumeration is
 * deterministic and re-running on an unchanged parent yields the identical list.
 *
 * This is intentionally shallow (immediate children only) — the parent is a
 * *container of repos*, not a repo to recurse into.
 */
export function enumerateRepos(parent: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  const repos: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith(".")) continue;
    const dir = join(parent, e.name);
    if (isRepo(dir)) repos.push(e.name);
  }
  return repos.sort();
}

/**
 * (R-084) Render the "External source repositories" section that points the
 * source-reading skills at the read-only developer repos. Returns "" when there
 * are none (single-repo scaffold), so the docs that embed `{{DEVELOPER_REPOS}}`
 * stay byte-identical to before. When non-empty it is a self-contained block that
 * ends with a blank line, so it slots cleanly in front of the next heading. Paths
 * are inline code (`../<repo>/`), never links, so they can't trip `doctor`'s
 * broken-link check (the same trick the phase-1 inventory uses).
 */
export function renderDeveloperRepos(devRepos: string[]): string {
  if (devRepos.length === 0) return "";
  const list = devRepos.map((d) => `- \`../${d}/\``).join("\n");
  return `## External source repositories

> Read-only application source lives in sibling **developer repos** under the parent
> workspace folder. Read them at \`../<repo>/file:line\`; **never write to them** (see the
> \`multi-repo-boundaries\` guideline). Paths are inline code, not links — confirm each
> before relying on it (\`grounding\`).

${list}

`;
}

/** A directory qualifies as a repo if it is a git repo or holds a build manifest. */
function isRepo(dir: string): boolean {
  if (existsSync(join(dir, ".git"))) return true;
  return Object.keys(MODULE_MANIFESTS).some((m) => existsSync(join(dir, m)));
}

/**
 * Deterministically pick the most **test-like** candidate from a repo list (used
 * by `--yes` / CI, where there is no wizard to ask). Scores each name against
 * {@link TEST_REPO_HINTS}; ties (and the no-hint case) fall back to the first name
 * in sorted order, so the choice is stable. `candidates` must be non-empty.
 */
export function chooseTestRepo(candidates: string[]): string {
  const sorted = [...candidates].sort();
  const score = (name: string): number => {
    const lower = name.toLowerCase();
    const idx = TEST_REPO_HINTS.findIndex((h) => lower.includes(h));
    // Earlier hint = stronger signal = higher score; no hint = 0.
    return idx === -1 ? 0 : TEST_REPO_HINTS.length - idx;
  };
  let best = sorted[0]!;
  let bestScore = score(best);
  for (const name of sorted) {
    const s = score(name);
    if (s > bestScore) {
      best = name;
      bestScore = s;
    }
  }
  return best;
}

function joinPosix(dirRel: string, name: string): string {
  return dirRel === "" ? name : `${dirRel}/${name}`;
}
