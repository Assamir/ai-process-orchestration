<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# MCP content fetch

> Phase 1 seeded this standard. Phase 2 records this project's concrete fetch sources in the `{{PLACEHOLDER}}` section.

When a ticket, spec, test issue, or attachment is the input to a refinement, bug report, or plan, you **fetch it through MCP and read it** — you do not summarize from memory or from the ticket title. Skipping a step here (summarizing before the attachment is downloaded, converting a URL instead of a local file, guessing at a binary's contents) is the **#1 cause of hallucinated summaries**. The ordering below is a guarantee, not a suggestion: download → verify → convert → read, in that order, every time. "What's not in context doesn't exist" — an attachment you have not converted and read is not evidence.

## The fetch flow (in order)
1. **Discover.** `getIssue` for the Jira key → if it is a test issue (Test / Test Execution / Test Plan / Test Set), use the **`xray`** server → follow links to Confluence (`getPage` / `searchConfluence`) → list attachments (`getAttachments`) → fetch each (`getAttachmentContent`).
2. **Download to a staging path.** Save every attachment under `context/refinements/.attachments/<source-id>/<filename>`, where `<source-id>` is the `JIRA-KEY` | `PAGE-ID` | `XRAY-KEY` it came from. Stage by source so two tickets can't collide.
3. **Pre-flight verify.** Before converting, confirm the file **exists and its size is > 0**. A zero-byte or missing download is a failure to surface, not a file to summarize.
4. **Convert on the local path only.** Run **`markitdown`** against the **local file path** — never a URL or an attachment id (markitdown is local-path only). Read text formats (`.md` / `.txt` / `.json`) directly; use `view_image` for images. Only the converted Markdown is evidence you may cite.
5. **Clean up.** Remove the staging dir when done — it is git-ignored scratch, never committed.

## Source priority
Prefer the most authoritative source: **Jira + Xray** (for test issues) > **Jira** > **Confluence** > **Attachments**. Reach for an attachment only when the structured sources don't carry the fact.

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — download, verify, then convert the local file, and cite the converted text:
```
getAttachmentContent PROJ-217 spec.docx
  -> context/refinements/.attachments/PROJ-217/spec.docx   (12 KB, exists)
markitdown context/refinements/.attachments/PROJ-217/spec.docx
  -> "AC-2: reject empty cart at checkout"   (cited from the converted Markdown)
```

❌ **Avoid** — summarizing from the title, or converting a URL instead of the verified local file:
```
"The spec.docx probably covers the checkout flow."   # never downloaded/read — a guess
markitdown https://jira/secure/attachment/9001/spec.docx   # markitdown is local-path only
```

## Applicable patterns

> Encouraged: the fetch practices this project relies on (source-id staging dirs, download→verify→convert
> ordering, Xray-first for test issues, git-ignored `.attachments/`) so agents follow them.

{{MCP_FETCH_PATTERNS}}

## Project-specific fetch sources

> Record this project's concrete sources once known: the Jira/Confluence/Xray hosts, the doc space(s) specs live in, and which attachment formats actually appear.

{{PROJECT_MCP_FETCH_WORKFLOW}}
