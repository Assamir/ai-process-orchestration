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

// --- R-095/R-096: embedded test-subtree enumeration -------------------------
//
// The **embedded** topology: the test framework has no repo of its own — it lives
// as a *subtree* inside a developer repo (an `e2e/` folder, or a build module such
// as a Maven submodule / Gradle subproject / workspace package). `enumerateTestSubtrees`
// discovers candidate subtrees inside a host repo (reusing `buildRepoInventory`'s
// signals); `chooseTestSubtree` picks the most likely one deterministically for the
// non-interactive / proposal path. Kept **separate** from `enumerateRepos` — that
// operates at the repo level (immediate children of a parent), this at the subtree
// level (inside one repo) — so the multi-repo path is untouched.

/**
 * Test-**framework** config basenames that mark a directory as a self-contained
 * test subtree. A strict subset of {@link CONFIG_FILE_RE} — the CI configs
 * (`.gitlab-ci.yml`, `Jenkinsfile`, `.github/workflows/`, …) are deliberately
 * excluded, since a CI file at a path says nothing about a *writable test subtree*.
 */
const TEST_FRAMEWORK_CONFIG_RE =
  /^(playwright\.config\.[mc]?[jt]s|cypress\.config\.[mc]?[jt]s|jest\.config\.[mc]?[jt]s|jest\.config\.json|vitest\.config\.[mc]?[jt]s|wdio\.conf\.[jt]s|\.mocharc\.(json|ya?ml|js)|karma\.conf\.js|pytest\.ini|tox\.ini|conftest\.py|testng\.xml|junit-platform\.properties|cucumber\.ya?ml)$/;

/** The basename of a relative POSIX dir path matches a {@link TEST_REPO_HINTS} fragment. */
function nameMatchesTestHint(relDir: string): boolean {
  const base = (relDir.split("/").pop() ?? "").toLowerCase();
  return TEST_REPO_HINTS.some((h) => base.includes(h));
}

/**
 * Discover candidate **test subtrees** inside `host` — POSIX-relative directory
 * paths (never `"."`), sorted, deterministic. A directory qualifies when it is a
 * self-contained test area:
 *
 * 1. it directly contains a **test-framework config** ({@link TEST_FRAMEWORK_CONFIG_RE},
 *    e.g. `e2e/playwright.config.ts`, `integration/testng.xml`); or
 * 2. it is a **build module** ({@link MODULE_MANIFESTS}) whose name matches a
 *    {@link TEST_REPO_HINTS} fragment (a Maven submodule / Gradle subproject /
 *    workspace package such as `e2e-tests/pom.xml`); or
 * 3. it is a **top-level** conventional test directory whose name matches a test
 *    hint (`e2e/`, `qa-tests/`, `integration-tests/`) — restricted to depth 1 so a
 *    nested `src/test/java` inside the app module isn't mistaken for a subtree.
 *
 * Returns `[]` when nothing qualifies (the host has no embeddable test subtree).
 */
export function enumerateTestSubtrees(host: string): string[] {
  const inv = buildRepoInventory(host);
  const candidates = new Set<string>();

  for (const cfg of inv.configs) {
    const slash = cfg.lastIndexOf("/");
    if (slash === -1) continue; // a root-level config → the host itself, not a subtree
    const dir = cfg.slice(0, slash);
    const base = cfg.slice(slash + 1);
    if (dir !== "" && TEST_FRAMEWORK_CONFIG_RE.test(base)) candidates.add(dir);
  }
  for (const m of inv.modules) {
    if (m.dir !== "." && nameMatchesTestHint(m.dir)) candidates.add(m.dir);
  }
  for (const d of inv.testDirs) {
    if (!d.includes("/") && nameMatchesTestHint(d)) candidates.add(d);
  }

  return [...candidates].sort();
}

/**
 * Deterministically pick the most likely test subtree from a candidate list (used
 * by the wizard proposal and any non-interactive path). Prefers the **shallowest**
 * path (a top-level `e2e/` over a nested one), then the strongest
 * {@link TEST_REPO_HINTS} name match, then alphabetical order. Returns `null` for
 * an empty list — embedded detection can legitimately find nothing.
 */
export function chooseTestSubtree(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const hintRank = (p: string): number => {
    const base = (p.split("/").pop() ?? "").toLowerCase();
    const idx = TEST_REPO_HINTS.findIndex((h) => base.includes(h));
    return idx === -1 ? TEST_REPO_HINTS.length : idx; // earlier hint = smaller = better
  };
  return [...candidates].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db; // shallower first
    const ha = hintRank(a);
    const hb = hintRank(b);
    if (ha !== hb) return ha - hb;
    return a.localeCompare(b);
  })[0]!;
}

/**
 * Does any candidate repo qualify as a **dedicated** test repo — a sibling whose
 * *name* signals it (a {@link TEST_REPO_HINTS} match)? This is the precedence gate
 * for a parent workspace (R-095/D5): a dedicated test repo **wins**, and embedded
 * detection is the fallback only when no repo's name marks it as the test repo.
 * (`chooseTestRepo` always returns *something* via its alphabetical fallback, so it
 * can't answer "is there a dedicated one?" — this can.)
 */
export function hasDedicatedTestRepo(candidates: string[]): boolean {
  return candidates.some((c) => nameMatchesTestHint(c));
}
