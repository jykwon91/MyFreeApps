/**
 * WoW Forever "Macros" — static, frontend-only page for every class.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-macros
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const HOVER_CAST_HEADING = "Hover-cast macros (mouseover)";

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

async function readClipboard(page: Page): Promise<string> {
  // Windows browsers hand the clipboard back with CRLF line ends.
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
}

async function expectHoverCastFirst(page: Page) {
  const sections = page.locator("main h2");
  await expect(sections).toHaveText(["How to make a macro", HOVER_CAST_HEADING, "Tag a mob first", "Ready-made macros by class"]);
  await expect(page.getByRole("heading", { name: HOVER_CAST_HEADING, level: 2 })).toBeInViewport();
}

test("the hub tile opens the Macros page with hover cast as the first macro section", async ({ page }) => {
  await page.goto("/wow-forever");
  await expect(page.getByRole("link", { name: /^Warlock macros/ })).toHaveCount(0);
  await page.getByRole("link", { name: /^Macros.*Hover-cast/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/macros$/);
  await expect(page.getByRole("heading", { name: "Macros", level: 1 })).toBeVisible();
  await expectHoverCastFirst(page);
  await expect(page.getByText("A hover-cast macro casts on whoever your mouse is over, without changing your target.")).toBeVisible();
});

test("the old Warlock page redirects to the Macros page with Warlock picked", async ({ page }) => {
  await page.goto("/wow-forever/warlock-macros");
  await expect(page).toHaveURL(/\/wow-forever\/macros\?class=warlock$/);
  await expectHoverCastFirst(page);
  await expect(page.getByRole("radio", { name: "Warlock" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { level: 3, name: "Warlock" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Priest" })).toHaveCount(0);

  const warlock = page.getByRole("region", { name: "Warlock" });
  await expect(warlock.getByRole("heading", { level: 4 }).first()).toHaveText("Hover cast");
  const focus = page.getByRole("article", { name: "Fear your focus" });
  await expect(focus.getByTestId("macro-text")).toHaveText("/cast [@focus,harm,nodead][] Fear");
  await expect(focus.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "unconfirmed");
  const healthstone = page.getByRole("article", { name: "Use your Healthstone" });
  await expect(healthstone.getByTestId("macro-text")).toContainText("/use Major Healthstone");
  await expect(healthstone.getByText(/Names checked against the Forever client/)).toBeVisible();
});

test("the class picker filters the list, keeps it in the URL and remembers it", async ({ page }) => {
  await page.goto("/wow-forever/macros");
  for (const name of ["Druid", "Priest", "Rogue", "Warlock", "Warrior"]) {
    await expect(page.getByRole("heading", { level: 3, name, exact: true })).toBeVisible();
  }
  await page.getByRole("radio", { name: "Shaman" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/macros\?class=shaman$/);
  await expect(page.getByRole("heading", { level: 3, name: "Druid" })).toHaveCount(0);
  const shaman = page.getByRole("region", { name: "Shaman" });
  await expect(shaman.getByRole("heading", { level: 4 }).first()).toHaveText("Hover cast");

  const card = page.getByRole("article", { name: "Earth Shock (Shaman)" });
  await expect(card.getByTestId("macro-text")).toHaveText("#showtooltip\n/cast [@mouseover,harm,nodead][] Earth Shock");
  await card.getByRole("button", { name: "Copy macro: Earth Shock (Shaman)" }).click();
  expect(await readClipboard(page)).toBe("#showtooltip\n/cast [@mouseover,harm,nodead][] Earth Shock");

  await page.goto("/wow-forever/macros");
  await expect(page.getByRole("radio", { name: "Shaman" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "All classes" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/macros$/);
  await expect(page.getByRole("heading", { level: 3, name: "Druid" })).toBeVisible();
});

test("typing a spell fills the hover-cast templates, and Copy puts it on the clipboard", async ({ page }) => {
  await page.goto("/wow-forever/macros");
  const friendly = page.getByRole("article", { name: "Hover cast on a friend" });
  await expect(friendly.getByTestId("macro-text")).toContainText("[@player] Spell Name");

  await page.getByLabel("Your spell name").fill("Flash Heal");
  await expect(friendly.getByTestId("macro-text")).toHaveText("#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal");

  const button = friendly.getByRole("button", { name: "Copy macro: Hover cast on a friend" });
  await button.click();
  await expect(button).toContainText("Copied");
  await expect(page.getByText('Copied "Hover cast on a friend"', { exact: true })).toBeVisible();
  expect(await readClipboard(page)).toBe("#showtooltip\n/cast [@mouseover,help,nodead][help,nodead][@player] Flash Heal");

  await page.getByLabel("Your spell name").fill("");
  await expect(friendly.getByTestId("macro-text")).toContainText("Spell Name");
});

test("a refused clipboard shows an error toast, not a false success", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto("/wow-forever/macros?class=warlock");
  await page.getByRole("button", { name: "Copy macro: Life Tap" }).click();
  await expect(page.getByText("Couldn't copy \"Life Tap\". Select the text and copy it by hand.", { exact: true })).toBeVisible();
  await expect(page.getByText('Copied "Life Tap"', { exact: true })).toHaveCount(0);
});

test("the phone layout never scrolls sideways and keeps touch targets large", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/macros");
  await page.getByLabel("Your spell name").fill("X".repeat(60));
  const input = await page.getByLabel("Your spell name").boundingBox();
  expect(input?.height).toBeGreaterThanOrEqual(44);
  for (const target of [
    page.getByRole("button", { name: "Copy macro: Hover cast on a friend" }),
    page.getByRole("radio", { name: "All classes" }),
    page.getByRole("radio", { name: "Warlock" }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  // The longest macro stays inside its card.
  await expect(page.getByRole("article", { name: "Healthstone and potion together" })).toBeAttached();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("pasting a mob's name gives a Corruption tag macro to copy, and #tag jumps to it", async ({ page }) => {
  await page.goto("/wow-forever/macros#tag");
  const section = page.locator("section#tag");
  await expect(section.getByRole("heading", { name: "Tag a mob first", level: 2 })).toBeInViewport();
  await section.getByTestId("tag-mob-names").fill("Lord Gregor Lescovar");
  const card = section.getByRole("article", { name: "Tag macro" });
  await card.getByRole("button", { name: "Copy macro: Tag macro" }).click();
  const NL = String.fromCharCode(10);
  expect(await readClipboard(page)).toBe(
    ["#showtooltip Corruption", "/cleartarget", "/targetexact Lord Gregor Lescovar", "/stopmacro [noexists][dead]", "/cast Corruption"].join(NL),
  );
  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the link at the top of the Macros page jumps to the tag macro builder", async ({ page }) => {
  await page.goto("/wow-forever/macros");
  await page.getByRole("link", { name: "Tag a mob first: paste its name, get a macro" }).click();
  await expect(page).toHaveURL(/#tag$/);
  await expect(page.getByTestId("tag-mob-names")).toBeInViewport();
});
