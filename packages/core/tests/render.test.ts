import { describe, expect, it } from "vitest";
import { render } from "../src/render.js";

describe("render", () => {
  it("replaces known placeholders", () => {
    expect(render("Hello {{NAME}}", { NAME: "world" })).toBe("Hello world");
  });

  it("leaves unknown placeholders intact for phase 2", () => {
    expect(render("{{KNOWN}} and {{UNKNOWN}}", { KNOWN: "x" })).toBe("x and {{UNKNOWN}}");
  });

  it("tolerates surrounding whitespace in the token", () => {
    expect(render("{{ NAME }}", { NAME: "ok" })).toBe("ok");
  });

  it("replaces every occurrence", () => {
    expect(render("{{A}}-{{A}}", { A: "1" })).toBe("1-1");
  });
});
