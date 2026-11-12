/**
 * WoW Forever "Changes vs Classic" — category, class and search filters kept in
 * the URL, the links to our own pages (talent calculator deep link, item page,
 * World Map), the badges, the phone layout and the loading skeleton.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-changes
 */
import { test, expect, type Page } from "@playwright/test";

const CHANGES = "/wow-forever/changes";

function entries(page: Page) {
  return page.getByTestId("change-entry");
}

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("filter by category, class and search; the URL keeps it", async ({ page }) => {
  await page.goto(CHANGES);
  await expect(page.getByRole("heading", { level: 1, name: "Changes vs Classic" })).toBeVisible();
  await expect(page).toHaveTitle(/Changes vs Classic/);
  // Talents by default.
  await expect(entries(page).first()).toBeVisible();
  await expect(page.getByTestId("change-count")).toContainText("387 changes");

  await page.getByLabel("Class").selectOption("mage");
  await expect(page).toHaveURL(/[?&]class=mage(&|$)/);
  await page.getByLabel("Search").fill("improved channeling");
  await expect(page).toHaveURL(/[?&]q=improved\+channeling(&|$)/);
  await expect(entries(page)).toHaveCount(1);
  const focus = entries(page).first();
  await expect(focus.getByRole("heading")).toHaveText("Improved Channeling (Arcane)");
  await expect(focus.getByTestId("change-rows")).toContainText("20% chance to avoid interruption caused by damage");
  await expect(focus.getByTestId("change-rows")).toContainText("Arcane Blast and Arcane Wrath spells a 14% chance");
  await expect(focus.getByTestId("provenance-badge").first()).toHaveAttribute("data-provenance", "published");
  await expect(focus.getByTestId("provenance-badge").nth(1)).toHaveAttribute("data-provenance", "classic");

  // A reload keeps the filters.
  await page.reload();
  await expect(page.getByLabel("Search")).toHaveValue("improved channeling");
  await expect(entries(page)).toHaveCount(1);

  // Search with no match says so.
  await page.getByLabel("Search").fill("improved channeling nothinglikethis");
  await expect(page.getByText("No changes match these filters.")).toBeVisible();

  // Zones have no classes, so the class filter goes away and the URL stays readable.
  await page.getByLabel("Search").fill("");
  await page.getByRole("radio", { name: /Zones & maps/ }).click();
  await expect(page).toHaveURL(/[?&]cat=zones(&|$)/);
  await expect(page.getByLabel("Class")).toHaveCount(0);
  await expect(entries(page).filter({ hasText: "Mount Hyjal" })).toHaveCount(1);
  // "Since last build" waits for a second data refresh.
  await expect(page.getByTestId("change-since-note")).toBeVisible();
});

test("a talent row opens the calculator on that talent", async ({ page }) => {
  await page.goto(`${CHANGES}?class=mage&q=improved+channeling`);
  await entries(page).first().getByRole("link", { name: "Improved Channeling (Arcane)" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/talents\/mage\?talent=135343$/);
  await expect(page.getByTestId("talent-details")).toContainText("Improved Channeling");
});

test("an item row links to its item page, and Back returns to the feed", async ({ page }) => {
  await page.goto(`${CHANGES}?cat=items&q=destiny`);
  const destiny = entries(page).filter({ has: page.getByRole("link", { name: "Destiny", exact: true }) });
  await expect(destiny.getByTestId("change-rows")).toContainText("155–233");
  await destiny.getByRole("link", { name: "Destiny", exact: true }).click();
  await expect(page).toHaveURL(/\/wow-forever\/items\/647$/);
  await page.getByRole("link", { name: "Back to Changes vs Classic" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/changes\?cat=items&q=destiny$/);
});

test("a new zone links to the World Map; a new quest is badged Seen in game", async ({ page }) => {
  await page.goto(`${CHANGES}?cat=zones`);
  await expect(entries(page).filter({ hasText: "Mount Hyjal" }).getByRole("link", { name: "Mount Hyjal" })).toHaveAttribute(
    "href",
    "/wow-forever/map?m=2482",
  );
  await page.goto(`${CHANGES}?cat=quests&q=dynamite+plan`);
  const quest = entries(page).first();
  await expect(quest).toContainText("New quest, level 16");
  await expect(quest.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "seen");
});

test("on a 375 px phone the rows stack, nothing scrolls sideways and targets are 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${CHANGES}?cat=spells`);
  await expect(entries(page).first()).toBeVisible();
  expect(await noSideways(page)).toBeLessThanOrEqual(0);
  for (const target of [page.getByLabel("Search"), page.getByLabel("Class"), page.getByRole("radio", { name: /Items/ })]) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("button", { name: /Show 50 more/ })).toBeVisible();
  await page.getByRole("button", { name: /Show 50 more/ }).click();
  await expect(entries(page)).toHaveCount(100);
});

test("the skeleton shows while a category loads, shaped like the cards", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Hold the lazy shards only; the small index is part of the page's own chunk.
  await page.route(/data\/changes\/(?!index\.json).*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(CHANGES);
  const skeleton = page.getByTestId("change-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("change-skeleton-card")).toHaveCount(6);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(entries(page).first()).toBeVisible();
});
