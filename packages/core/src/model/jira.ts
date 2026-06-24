/**
 * R-064 - Shared **Markdown -> Jira wiki markup** machine. The single source of
 * the transform, reused by the bug report (R-064) and the ticket refinement
 * (R-066) so both produce paste-ready `.jira` output the same way.
 *
 * Two surfaces:
 * - {@link mdToJira} - the deterministic converter (snapshot-tested), the
 *   reference implementation of the conversion table.
 * - {@link JIRA_CONVERSION_TABLE} - the same table as a Markdown string, embedded
 *   verbatim into the producing skill bodies so the rule the LLM follows and the
 *   function we test can never drift.
 *
 * The converter preserves existing Jira macros (`{code}` / `{panel}` / `{info}` /
 * `{warning}` / `{noformat}`) untouched, so content already in wiki markup passes
 * through. Inline code that contains a `{N}`-style regex quantifier is rendered as
 * `{noformat}` rather than `{{...}}` (the `{{...}}` form would itself be parsed).
 */

/** The Markdown->Jira conversion table (A5), embedded into producing skill bodies. */
export const JIRA_CONVERSION_TABLE = `| Markdown | Jira wiki markup |
|----------|------------------|
| \`# H1\` / \`## H2\` / \`### H3\` | \`h1.\` / \`h2.\` / \`h3.\` |
| \`**bold**\` | \`*bold*\` |
| \`*italic*\` / \`_italic_\` | \`_italic_\` |
| \`\\\`inline\\\`\` | \`{{inline}}\` (use \`{noformat}\` if a \`{N}\` quantifier is present) |
| fenced \`\\\`\\\`\\\`lang\` | \`{code:lang}...{code}\` |
| \`- item\` / \`1. item\` | \`* item\` / \`# item\` |
| \`- [ ]\` | \`* ( )\` |
| \`[text](url)\` | \`[text|url]\` |
| \`> quote\` | \`{quote}...{quote}\` |
| table header / row | \`||h||\` / \`|c|c|\` |
| \`![alt](img)\` | \`!img!\` |
| \`---\` | \`----\` |

Preserve \`{code}\` / \`{panel}\` / \`{info}\` / \`{warning}\` / \`{noformat}\` macros unchanged.`;

/** The five merged Jira ticket types a refinement can target (R-066). */
export type JiraTicketType = "Bug" | "Story/Feature" | "Task/Sub-task" | "Maintenance" | "Test Case";

/**
 * The per-type `.jira` body section headers (A4), in exact order. The refinement
 * skill renders the matching set as `h3.` sections; one source so the doc and the
 * skill agree.
 */
export const JIRA_TYPE_SECTIONS: Record<JiraTicketType, string[]> = {
  Bug: [
    "Environment",
    "Preconditions",
    "Steps to Reproduce",
    "Actual Result",
    "Expected Result",
    "Impact",
    "Observations / Logs",
    "Open Questions",
  ],
  "Story/Feature": [
    "Story",
    "Context",
    "Scope",
    "Out of Scope",
    "Acceptance Criteria",
    "Dependencies / Risks",
    "Notes",
  ],
  "Task/Sub-task": ["Objective", "Description", "Definition of Done"],
  Maintenance: [
    "Maintenance Type",
    "Goal",
    "Current State",
    "Proposed Change",
    "Backward Compatibility",
    "Out of Scope",
    "Verification",
    "Acceptance Criteria",
  ],
  "Test Case": [
    "API Endpoint",
    "Preconditions",
    "Test Steps",
    "Expected Result",
    "Affected Codebase",
    "Recommendations",
  ],
};

/** Jira macro openers that pass through `mdToJira` untouched. */
const PRESERVED_MACRO = /^\{(code|panel|info|warning|noformat|quote)(:[^}]*)?\}/;

/**
 * Convert a Markdown document to Jira wiki markup per {@link JIRA_CONVERSION_TABLE}.
 * Deterministic and dependency-free; line-based with a small amount of block state
 * (fenced code, tables, block quotes). Content already inside a preserved macro is
 * emitted verbatim.
 */
export function mdToJira(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  let inFence = false; // inside a ```fenced``` block
  let inMacro = false; // inside a multi-line {code}/{panel}/... macro block

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Preserve existing Jira macros untouched (a {code}...{code} pasted in already).
    if (!inFence) {
      if (inMacro) {
        out.push(line);
        if (/^\{(code|panel|info|warning|noformat|quote)\}$/.test(line.trim())) inMacro = false;
        continue;
      }
      const t = line.trim();
      if (PRESERVED_MACRO.test(t)) {
        out.push(line);
        const opener = t.match(PRESERVED_MACRO)![0];
        const closer = opener.replace(/:[^}]*\}$/, "}");
        // A single-line macro (`{info}text{info}`) closes on the same line; a bare
        // opener starts a block that runs until its closing token.
        if (!t.slice(opener.length).includes(closer)) inMacro = true;
        continue;
      }
    }

    // Fenced code -> {code:lang} ... {code}.
    const fence = line.match(/^(\s*)```+\s*([A-Za-z0-9+#-]*)\s*$/);
    if (fence) {
      if (!inFence) {
        const lang = fence[2] ?? "";
        out.push(lang ? `{code:${lang}}` : "{code}");
        inFence = true;
      } else {
        out.push("{code}");
        inFence = false;
      }
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    out.push(convertBlockLine(line));
  }

  return collapseTables(out).join("\n");
}

/** Convert one non-code line (block-level prefix, then inline spans). */
function convertBlockLine(line: string): string {
  // Horizontal rule.
  if (/^\s*---+\s*$/.test(line)) return "----";

  // Heading.
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) return `h${h[1]!.length}. ${inline(h[2]!)}`;

  // Block quote.
  const q = line.match(/^\s*>\s?(.*)$/);
  if (q) return `{quote}${inline(q[1]!)}{quote}`;

  // Table row (left as `|...|`; the separator row is dropped in collapseTables).
  if (/^\s*\|.*\|\s*$/.test(line)) return line.trim();

  // Checkbox list item.
  const cb = line.match(/^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/);
  if (cb) {
    const depth = Math.floor(cb[1]!.length / 2) + 1;
    const mark = cb[2]!.toLowerCase() === "x" ? "(x)" : "( )";
    return `${"*".repeat(depth)} ${mark} ${inline(cb[3]!)}`;
  }

  // Bulleted list item.
  const ul = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (ul) {
    const depth = Math.floor(ul[1]!.length / 2) + 1;
    return `${"*".repeat(depth)} ${inline(ul[2]!)}`;
  }

  // Ordered list item.
  const ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
  if (ol) {
    const depth = Math.floor(ol[1]!.length / 2) + 1;
    return `${"#".repeat(depth)} ${inline(ol[2]!)}`;
  }

  return inline(line);
}

/** Inline-span conversion (images, links, bold/italic, inline code). */
function inline(text: string): string {
  const tokens: string[] = [];
  const stash = (value: string): string => {
    tokens.push(value);
    return ` ${tokens.length - 1} `;
  };

  // Protect inline code first so its contents aren't re-transformed. A `{N}` regex
  // quantifier would be eaten by Jira's `{{...}}`, so fall back to {noformat}.
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) =>
    stash(/\{\d/.test(c) ? `{noformat}${c}{noformat}` : `{{${c}}}`),
  );

  // Images before links (image syntax is a superset of the link syntax).
  s = s.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_m, url: string) => stash(`!${url}!`));
  // Links -> [text|url].
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, url: string) => stash(`[${t}|${url}]`));
  // Bold (** or __) -> *bold*. Stash so the italic pass can't re-match the single `*`.
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => stash(`*${b}*`));
  s = s.replace(/__([^_]+)__/g, (_m, b: string) => stash(`*${b}*`));
  // Italic (* or _) -> _italic_.
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, (_m, pre: string, it: string) => `${pre}_${it}_`);
  s = s.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!_)/g, (_m, pre: string, it: string) => `${pre}_${it}_`);

  // Restore stashed spans.
  s = s.replace(/ (\d+) /g, (_m, n: string) => tokens[Number(n)]!);
  return s;
}

/**
 * Post-process emitted lines so Markdown tables become Jira tables: the header row
 * (the one immediately followed by a `|---|` separator) gets `||` cell delimiters,
 * the separator row is dropped, and data rows keep single `|` delimiters.
 */
function collapseTables(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isRow = /^\|.*\|$/.test(line);
    const next = lines[i + 1] ?? "";
    const isSeparator = /^\|[\s:|-]+\|$/.test(line);
    if (isSeparator) continue; // drop the |---|---| separator
    if (isRow && /^\|[\s:|-]+\|$/.test(next)) {
      // Header row: turn `|a|b|` into `||a||b||`.
      const cells = splitRow(line);
      out.push(`||${cells.join("||")}||`);
      continue;
    }
    if (isRow) {
      out.push(`|${splitRow(line).join("|")}|`);
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Split a `| a | b |` table row into trimmed cell contents. */
function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}
