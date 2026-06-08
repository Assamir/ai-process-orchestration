import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectStack } from "../src/detect/index.js";
import { tempProject } from "./helpers.js";

describe("detectStack (QA stacks)", () => {
  let project: ReturnType<typeof tempProject>;

  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("detects Playwright (TypeScript)", () => {
    project.write(
      "package.json",
      JSON.stringify({ name: "demo", devDependencies: { "@playwright/test": "^1.44", eslint: "^9" } }),
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("node");
    expect(stack.frameworks).toContain("playwright-ts");
    expect(stack.primaryFramework).toBe("playwright-ts");
    expect(stack.linters).toContain("eslint");
  });

  it("detects Playwright (Java) on Maven", () => {
    project.write(
      "pom.xml",
      `<project><dependencies><dependency><groupId>com.microsoft.playwright</groupId><artifactId>playwright</artifactId></dependency>
       <dependency><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>`,
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("java");
    expect(stack.buildTool).toBe("maven");
    expect(stack.frameworks).toEqual(expect.arrayContaining(["playwright-java", "junit5"]));
    expect(stack.primaryFramework).toBe("playwright-java");
  });

  it("detects RestAssured + JUnit on Gradle and prefers RestAssured as primary", () => {
    project.write(
      "build.gradle",
      `dependencies {
         testImplementation 'io.rest-assured:rest-assured:5.4.0'
         testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'
       }`,
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("java");
    expect(stack.buildTool).toBe("gradle");
    expect(stack.frameworks).toEqual(expect.arrayContaining(["restassured", "junit5"]));
    expect(stack.primaryFramework).toBe("restassured");
  });

  it("prefers Node when multiple stacks are present", () => {
    project.write("package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1" } }));
    project.write("pom.xml", "<project><dependencies><dependency><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>");
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("node");
    expect(stack.manifests).toEqual(expect.arrayContaining(["package.json", "pom.xml"]));
  });

  it("returns null language and unknown framework for an empty directory", () => {
    const stack = detectStack(project.dir);
    expect(stack.language).toBeNull();
    expect(stack.primaryFramework).toBe("unknown");
    expect(stack.frameworks).toEqual([]);
  });
});
