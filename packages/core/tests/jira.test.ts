import { describe, expect, it } from "vitest";
import { JIRA_CONVERSION_TABLE, JIRA_TYPE_SECTIONS, mdToJira, SKILLS } from "../src/index.js";

describe("Markdown→Jira machine (R-064)", () => {
  it("converts headings to hN.", () => {
    expect(mdToJira("# Title")).toBe("h1. Title");
    expect(mdToJira("## Sub")).toBe("h2. Sub");
    expect(mdToJira("### Deep")).toBe("h3. Deep");
  });

  it("converts bold and italic", () => {
    expect(mdToJira("**bold** and *italic* and _em_")).toBe("*bold* and _italic_ and _em_");
  });

  it("converts inline code, using {noformat} for {N} quantifiers", () => {
    expect(mdToJira("call `getIssue()` now")).toBe("call {{getIssue()}} now");
    // A `{N}` regex quantifier would be eaten by `{{…}}`, so use {noformat}.
    expect(mdToJira("regex `a{2}b` here")).toBe("regex {noformat}a{2}b{noformat} here");
  });

  it("converts fenced code to {code:lang} … {code}", () => {
    expect(mdToJira("```java\nint x = 1;\n```")).toBe("{code:java}\nint x = 1;\n{code}");
    expect(mdToJira("```\nplain\n```")).toBe("{code}\nplain\n{code}");
  });

  it("does not transform content inside a fenced block", () => {
    expect(mdToJira("```\n**not bold** # not heading\n```")).toBe(
      "{code}\n**not bold** # not heading\n{code}",
    );
  });

  it("converts lists, checkboxes, and ordered items", () => {
    expect(mdToJira("- one\n- two")).toBe("* one\n* two");
    expect(mdToJira("1. first\n2. second")).toBe("# first\n# second");
    expect(mdToJira("- [ ] todo\n- [x] done")).toBe("* ( ) todo\n* (x) done");
  });

  it("converts links, images, quotes, and rules", () => {
    expect(mdToJira("see [docs](https://x.example)")).toBe("see [docs|https://x.example]");
    expect(mdToJira("![alt](img.png)")).toBe("!img.png!");
    expect(mdToJira("> a quote")).toBe("{quote}a quote{quote}");
    expect(mdToJira("---")).toBe("----");
  });

  it("converts a Markdown table to a Jira table (||header|| + dropped separator)", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    expect(mdToJira(md)).toBe("||A||B||\n|1|2|");
  });

  it("preserves existing Jira macros untouched", () => {
    expect(mdToJira("{panel}kept{panel}")).toBe("{panel}kept{panel}");
  });

  it("renders a representative bug report deterministically (snapshot)", () => {
    const md = [
      "# Bug: checkout 500",
      "- **Severity / Priority:** S2 / P1",
      "",
      "## Steps to reproduce",
      "1. open `/checkout`",
      "2. submit empty cart",
      "",
      "## Observations / logs",
      "```",
      "HTTP 500 Internal Server Error",
      "```",
    ].join("\n");
    expect(mdToJira(md)).toMatchInlineSnapshot(`
      "h1. Bug: checkout 500
      * *Severity / Priority:* S2 / P1

      h2. Steps to reproduce
      # open {{/checkout}}
      # submit empty cart

      h2. Observations / logs
      {code}
      HTTP 500 Internal Server Error
      {code}"
    `);
  });

  it("exposes the conversion table and the five ticket-type section sets", () => {
    expect(JIRA_CONVERSION_TABLE).toContain("Jira wiki markup");
    expect(Object.keys(JIRA_TYPE_SECTIONS)).toEqual([
      "Bug",
      "Story/Feature",
      "Task/Sub-task",
      "Maintenance",
      "Test Case",
    ]);
    expect(JIRA_TYPE_SECTIONS.Bug).toContain("Steps to Reproduce");
  });

  it("qa-bug-report embeds the shared conversion table and writes a .jira (R-064)", () => {
    const bug = SKILLS.find((s) => s.name === "qa-bug-report")!;
    expect(bug.writes).toContain("context/changes/<work-id>/bug-report.jira");
    expect(bug.body).toContain("Markdown→Jira");
    expect(bug.body).toContain(JIRA_CONVERSION_TABLE);
  });
});
