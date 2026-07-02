<!-- Auto-generated from packages/core/src/model/context.ts by packages/core/src/docs/guideline-flows.ts (R-090). Do not edit by hand — the snapshot test packages/core/tests/guideline-flows.test.ts fails on drift; regenerate with `npm run docs`. -->

# Page object conventions

> Phase 1 seeded this standard. Phase 2 records this project's concrete page-object setup in the `{{PLACEHOLDER}}` section.

A page object is the single place a test talks to a screen: it **owns the locators and the actions**, so a UI change is fixed in one class instead of across every test. `qa-page-objects` generates this layer and `qa-test-automate` composes tests against it; this guideline governs *how* the layer is shaped so it stays maintainable. Rule of thumb: a test reads like a user story (`loginPage.signIn(user)`), never like a locator dump.

## Rules
- **One class per page, components for repeats.** Each screen/route is one page object; a fragment that recurs across screens (nav bar, data table, modal, form) is its own **component object** that pages compose via fields — never copy a locator into two classes.
- **Locators live in the object, never in the test.** All selectors are private fields of the page/component; tests call intent-named methods only. A raw `page.locator(...)` in a test is a leak.
- **Locator ladder (most → least stable):** role+name (`getByRole`) → `getByLabel`/`getByText` → `data-testid` → stable CSS → xpath (last resort). Prefer semantic/accessible handles; reach down the ladder only when the one above is unavailable. A missing stable handle is a `data-testid` **recommendation to the frontend**, not a licence to hard-code brittle CSS/xpath.
- **No assertions inside page objects.** A page object *does* and *exposes state*; the **test** asserts. Actions return a page/component object (or `this`) so calls compose; queries return values / `Locator`s the test asserts on. Assertions inside a PO couple it to one test's expectations.
- **Consistent naming & files.** TS: `PascalCase` class in `pages/` / `components/`, one file per class. Java: `PascalCase` class under the framework's page-object package. Method names read as user intent (`openMenu`, `submitForm`), not mechanics (`clickButton3`).

## Examples (✅ good / ❌ bad — required)

> Every guideline shows the pattern, it doesn't just describe it.

✅ **Good** — locators as fields, an action returning a page object, the test does the asserting:
```ts
class LoginPage extends BasePage {
  private readonly user = this.page.getByLabel("Email");
  private readonly submit = this.page.getByRole("button", { name: "Sign in" });
  async signIn(u: User): Promise<DashboardPage> {
    await this.user.fill(u.email);
    await this.submit.click();
    return new DashboardPage(this.page);
  }
}
// test: await expect(dashboard.greeting).toHaveText("Hi Ada");  // the TEST asserts
```

❌ **Avoid** — a raw locator in the test, an assertion inside the object, a brittle nth-child selector:
```ts
// page object
async signIn() { await this.page.locator("div > form > button:nth-child(3)").click();
                 await expect(this.page).toHaveURL(/dashboard/); }  // PO must not assert
// test
await page.locator("#app input[type=email]").fill("a@b.c");        // locator leaked into the test
```

## Applicable patterns

> Encouraged: name the PO patterns this project applies (a shared `BasePage`, component/fragment
> objects, fluent actions returning page objects, locators-as-fields, role-first selectors) so agents follow them.

{{PAGE_OBJECT_PATTERNS}}

## Project-specific page-object workflow

> Record this project's concrete setup once known: the base class, where pages/components live, the file/naming convention, and the selector policy (the `data-testid` attribute name, role-first, etc.).

{{PROJECT_PAGE_OBJECT_WORKFLOW}}

## Extended — worked page-object examples

> Maintainer reference. The lean tier above is the deployed contract; these are fuller TS + Java skeletons.

### TypeScript — BasePage + component composition
```ts
// pages/BasePage.ts
export abstract class BasePage {
  constructor(protected readonly page: Page) {}
}
// components/NavBar.ts — reusable fragment, composed by pages
export class NavBar {
  constructor(private readonly page: Page) {}
  private readonly account = this.page.getByRole("button", { name: "Account" });
  async openAccountMenu(): Promise<void> { await this.account.click(); }
}
// pages/DashboardPage.ts
export class DashboardPage extends BasePage {
  readonly nav = new NavBar(this.page);                  // composition, not inheritance
  readonly greeting = this.page.getByTestId("greeting"); // data-testid: rung 3, when no role/label fits
}
```

### Java — same layering with com.microsoft.playwright
```java
public abstract class BasePage {
  protected final Page page;
  protected BasePage(Page page) { this.page = page; }
}
public class NavBar {                                     // component object
  private final Page page;
  public NavBar(Page page) { this.page = page; }
  private Locator account() { return page.getByRole(AriaRole.BUTTON,
      new Page.GetByRoleOptions().setName("Account")); }
  public void openAccountMenu() { account().click(); }
}
public class DashboardPage extends BasePage {
  public final NavBar nav;
  public DashboardPage(Page page) { super(page); this.nav = new NavBar(page); }
  public Locator greeting() { return page.getByTestId("greeting"); }
}
```

### Notes
- **Composition over inheritance** for fragments: a page *has-a* NavBar, it does not extend it. Only the thin `BasePage` (shared `page` handle / common waits) is inherited.
- **Return types drive fluency:** an action that navigates returns the next page object; an action that stays returns `this`; a query returns a value or `Locator`.
- **data-testid is rung 3, not the default** — reach for it only when no role/label/text handle is stable, and record the recommendation in `page-objects.md` so the frontend can add it.
