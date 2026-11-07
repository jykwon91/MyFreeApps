/**
 * WoW Forever hub: the data-build line, "What's new on this site", and the
 * update dots on hub tiles and left-nav items.
 *
 * Run: npm run test:e2e -- wow-forever-whats-new
 */
import { test, expect, type Page } from "@playwright/test";

const VISITS_KEY = "mga.wowForever.pageVisits.v1";

/** A returning player who first came before every What's-new entry and hasn't opened a page since. Set once per test, not per navigation. */
async function seedOldVisit(page: Page) {
  await page.addInitScript((key) => {
    if (window.sessionStorage.getItem("e2e-seeded")) return;
    window.sessionStorage.setItem("e2e-seeded", "1");
    window.localStorage.setItem(key, JSON.stringify({ baseline: [], pages: {} }));
  }, VISITS_KEY);
}

function tile(page: Page, title: string) {
  return page.locator("main .grid").getByRole("link", { name: new RegExp(`^${title}`) });
}

test.beforeEach(async ({ page }) => {
  // The hub's live server status isn't what these tests check.
  await page.route("**/wow/server-status**", (route) => route.abort());
});

test("the hub shows the data build and the latest changes", async ({ page }) => {
  await page.goto("/wow-forever");
  await expect(page.getByTestId("wow-data-refresh")).toHaveText(
    /^Game data: patch \d+\.\d+\.\d+ \(build \d+\) · updated [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
  );
  const whatsNew = page.getByRole("region", { name: "What’s new on this site" });
  await expect(whatsNew.getByRole("listitem")).toHaveCount(5);
  await whatsNew.getByRole("button", { name: /^Show all/ }).click();
  await expect(whatsNew.getByRole("listitem")).toHaveCount(13);
  await whatsNew.getByRole("link", { name: /One Macros page/ }).click();
  await expect(page).toHaveURL(/\/wow-forever\/macros$/);
});

test("a first-ever visit shows no update dots", async ({ page }) => {
  await page.goto("/wow-forever");
  await expect(page.getByRole("region", { name: "What’s new on this site" })).toBeVisible();
  await expect(page.getByTestId("update-dot")).toHaveCount(0);
  await expect(page.getByTestId("nav-item-dot")).toHaveCount(0);
});

test("a page's dot shows until the player visits it", async ({ page }) => {
  await seedOldVisit(page);
  await page.goto("/wow-forever");
  const sidebar = page.locator("#main-sidebar");

  await expect(tile(page, "Best gear").getByTestId("update-dot")).toBeVisible();
  const gearNav = sidebar.getByRole("link", { name: "Best gear (new since your last visit)" });
  await expect(gearNav.getByTestId("nav-item-dot")).toBeVisible();
  // The hub itself is being visited, so its own dot is already gone.
  await expect(sidebar.getByRole("link", { name: "Overview", exact: true })).toBeVisible();

  await tile(page, "Best gear").click();
  await expect(page).toHaveURL(/\/wow-forever\/gear/);
  await expect(sidebar.getByRole("link", { name: "Best gear", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Best gear", exact: true }).getByTestId("nav-item-dot")).toHaveCount(0);

  await sidebar.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/wow-forever$/);
  await expect(tile(page, "Best gear").getByTestId("update-dot")).toHaveCount(0);
  // Pages not visited keep theirs.
  await expect(tile(page, "Professions").getByTestId("update-dot")).toBeVisible();

  // And it stays cleared after a reload.
  await page.reload();
  await expect(tile(page, "Best gear")).toBeVisible();
  await expect(tile(page, "Best gear").getByTestId("update-dot")).toHaveCount(0);
});

test("375px: the hub fits the screen and the bottom nav carries the dots", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedOldVisit(page);
  await page.goto("/wow-forever");
  await expect(page.getByRole("region", { name: "What’s new on this site" })).toBeVisible();
  await expect(tile(page, "Best gear").getByTestId("update-dot")).toBeVisible();
  const bottomNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(bottomNav.getByRole("link", { name: "Best gear (new since your last visit)" })).toBeVisible();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main main") ?? document.querySelector("main");
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(overflow.doc).toBeLessThanOrEqual(0);
  expect(overflow.main).toBeLessThanOrEqual(0);
});
