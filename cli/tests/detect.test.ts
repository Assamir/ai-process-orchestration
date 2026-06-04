import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectStack } from "../src/detect/index.js";
import { tempProject } from "./helpers.js";

describe("detectStack", () => {
  let project: ReturnType<typeof tempProject>;

  beforeEach(() => {
    project = tempProject();
  });
  afterEach(() => project.cleanup());

  it("detects a Node project with vitest and eslint", () => {
    project.write(
      "package.json",
      JSON.stringify({ name: "demo", devDependencies: { vitest: "^1", eslint: "^9" } }),
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("node");
    expect(stack.buildTool).toBe("npm");
    expect(stack.testFramework).toBe("vitest");
    expect(stack.linters).toContain("eslint");
    expect(stack.manifests).toContain("package.json");
  });

  it("detects pnpm and jest", () => {
    project.write("package.json", JSON.stringify({ devDependencies: { jest: "^29" } }));
    project.write("pnpm-lock.yaml", "");
    const stack = detectStack(project.dir);
    expect(stack.buildTool).toBe("pnpm");
    expect(stack.testFramework).toBe("jest");
  });

  it("detects a Java/Maven project with JUnit and checkstyle", () => {
    project.write(
      "pom.xml",
      `<project><dependencies><dependency><artifactId>junit-jupiter</artifactId></dependency></dependencies>
       <build><plugins><plugin><artifactId>maven-checkstyle-plugin</artifactId></plugin></plugins></build></project>`,
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("java");
    expect(stack.buildTool).toBe("maven");
    expect(stack.testFramework).toBe("junit5");
    expect(stack.linters).toContain("checkstyle");
  });

  it("detects a Python/poetry project with pytest and ruff", () => {
    project.write(
      "pyproject.toml",
      `[tool.poetry]\nname = "demo"\n[tool.poetry.group.dev.dependencies]\npytest = "^8"\nruff = "^0.3"`,
    );
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("python");
    expect(stack.buildTool).toBe("poetry");
    expect(stack.testFramework).toBe("pytest");
    expect(stack.linters).toContain("ruff");
  });

  it("prefers Node when multiple stacks are present", () => {
    project.write("package.json", "{}");
    project.write("pom.xml", "<project/>");
    const stack = detectStack(project.dir);
    expect(stack.language).toBe("node");
    expect(stack.manifests).toEqual(expect.arrayContaining(["package.json", "pom.xml"]));
  });

  it("returns null language for an empty directory", () => {
    const stack = detectStack(project.dir);
    expect(stack.language).toBeNull();
    expect(stack.testFramework).toBe("unknown");
  });
});
