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

  it("detects pytest on Poetry as a first-class stack (R-006)", () => {
    project.write(
      "pyproject.toml",
      `[tool.poetry]
name = "demo"
[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
ruff = "^0.4"`,
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("python");
    expect(stack.buildTool).toBe("poetry");
    expect(stack.frameworks).toContain("pytest");
    expect(stack.primaryFramework).toBe("pytest");
    expect(stack.linters).toContain("ruff");
  });

  it("prefers Node when multiple stacks are present", () => {
    project.write("package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1" } }));
    project.write("pom.xml", "<project><dependencies><dependency><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>");
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("node");
    expect(stack.manifests).toEqual(expect.arrayContaining(["package.json", "pom.xml"]));
  });

  it("detects Allure as a cross-run observability tool (R-012)", () => {
    project.write(
      "package.json",
      JSON.stringify({ devDependencies: { "@playwright/test": "^1.44", "allure-playwright": "^3" } }),
    );
    const withAllure = detectStack(project.dir);
    expect(withAllure.observability).toContain("allure");

    const clean = tempProject();
    try {
      clean.write("package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1.44" } }));
      expect(detectStack(clean.dir).observability).toEqual([]);
    } finally {
      clean.cleanup();
    }
  });

  it("detects JMeter from a standalone .jmx plan and from a build entry (R-046)", () => {
    // Standalone JMeter: no build signal, just a .jmx test plan in the repo.
    project.write("package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1.44" } }));
    project.write("load-test.jmx", "<jmeterTestPlan></jmeterTestPlan>");
    const standalone = detectStack(project.dir);
    expect(standalone.performance).toContain("jmeter");
    // It is orthogonal to the functional framework, which is still detected.
    expect(standalone.primaryFramework).toBe("playwright-ts");

    // Build-entry JMeter: the jmeter-maven-plugin in a pom, no .jmx file.
    const maven = tempProject();
    try {
      maven.write(
        "pom.xml",
        `<project><build><plugins><plugin><groupId>com.lazerycode.jmeter</groupId>
         <artifactId>jmeter-maven-plugin</artifactId></plugin></plugins></build></project>`,
      );
      expect(detectStack(maven.dir).performance).toContain("jmeter");
    } finally {
      maven.cleanup();
    }

    // No JMeter signal → empty, nothing leaks in.
    const clean = tempProject();
    try {
      clean.write("package.json", JSON.stringify({ devDependencies: { "@playwright/test": "^1.44" } }));
      expect(detectStack(clean.dir).performance).toEqual([]);
    } finally {
      clean.cleanup();
    }
  });

  it("returns null language and unknown framework for an empty directory", () => {
    const stack = detectStack(project.dir);
    expect(stack.language).toBeNull();
    expect(stack.primaryFramework).toBe("unknown");
    expect(stack.frameworks).toEqual([]);
  });
});
