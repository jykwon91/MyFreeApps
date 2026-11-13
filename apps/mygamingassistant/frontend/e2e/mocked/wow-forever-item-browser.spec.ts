/**
 * WoW Forever item browser — the list of every item the Forever game files have
 * shown (count, paging), name search, filter chips with counts, sort and
 * direction, list / grid, all kept in the URL; opening an item and coming back;
 * the phone layout (filters folded behind one button) and the loading skeleton.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-item-browser
 */
import { test, expect, type Page } from "@playwright/test";

const ITEMS = "/wow-forever/items";
/** Items in the committed `data/items/itemIndex.json`. */
const ALL_ITEMS = 9486;
const PAGE_SIZE = 60;

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function countText(n: number): string {
  return `${n.toLocaleString("en-US")} items`;
}

// No backend in this run: icons answer 404 and show their placeholder.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/icons/**", (route) => route.fulfill({ status: 404, body: "" }));
});

test("the list shows every item, highest item level first, a page at a time", async ({ page }) => {
  await page.goto(ITEMS);
  await expect(page.getByRole("heading", { level: 1, name: "Items" })).toBeVisible();
  await expect(page).toHaveTitle(/Items · WoW Forever/);
  await expect(page.getByTestId("item-browser-count")).toContainText(countText(ALL_ITEMS));
  const rows = page.getByTestId("item-browser-row");
  await expect(rows).toHaveCount(PAGE_SIZE);
  // Highest item level first: the first row's level is at least the last row's.
  const levelOf = async (i: number) => Number(/Item level (\d+)/.exec((await rows.nth(i).textContent()) ?? "")?.[1]);
  expect(await levelOf(0)).toBeGreaterThanOrEqual(await levelOf(PAGE_SIZE - 1));

  await page.getByTestId("item-browser-more").click();
  await expect(rows).toHaveCount(PAGE_SIZE * 2);

  await expect(page.getByTestId("item-browser-note")).toContainText("Where this list comes from");
  await expect(page.getByTestId("item-browser-note").getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "client");
  await expect(page.locator('a[href*="wowhead"], a[href*="foreverchanges"]')).toHaveCount(0);
});

test("search finds an item by name, keeps it in the URL and forgives a typo", async ({ page }) => {
  await page.goto(ITEMS);
  const search = page.getByLabel("Search items by name");
  await search.fill("helm lionheart");
  await expect(page).toHaveURL(/q=helm\+lionheart/);
  const rows = page.getByTestId("item-browser-row");
  await expect(rows.filter({ hasText: "Lionheart Helm" })).toHaveCount(1);
  await expect(rows.first()).toContainText("Head, Plate");

  await search.fill("lionhart helm");
  await expect(page.getByTestId("item-browser-count")).toContainText("close spellings");
  await expect(rows.filter({ hasText: "Lionheart Helm" })).toHaveCount(1);

  await search.fill("zzzz no such item");
  await expect(page.getByText("No items match these filters.")).toBeVisible();

  // A reload keeps the search.
  await search.fill("lionheart");
  await page.reload();
  await expect(page.getByLabel("Search items by name")).toHaveValue("lionheart");
  await expect(rows.filter({ hasText: "Lionheart Helm" })).toHaveCount(1);
});

test("filter chips show counts, narrow the list, live in the URL and reset", async ({ page }) => {
  await page.goto(ITEMS);
  await expect(page.getByTestId("item-browser-count")).toContainText(countText(ALL_ITEMS));

  const epic = page.getByTestId("item-filter-quality").getByRole("button", { name: /^Epic/ });
  const epicCount = Number(((await epic.textContent()) ?? "").replace(/\D/g, ""));
  expect(epicCount).toBeGreaterThan(0);
  await epic.click();
  await expect(epic).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/quality=epic/);
  await expect(page.getByTestId("item-browser-count")).toContainText(countText(epicCount));

  // Another group narrows further; its own chips still count against the quality filter.
  const plate = page.getByTestId("item-filter-type").getByRole("button", { name: /^Plate/ });
  const plateCount = Number(((await plate.textContent()) ?? "").replace(/\D/g, ""));
  await plate.click();
  await expect(page).toHaveURL(/type=Plate/);
  await expect(page.getByTestId("item-browser-count")).toContainText(countText(plateCount));
  const rows = page.getByTestId("item-browser-row");
  await expect(rows.first()).toContainText("Plate");

  // "New in Forever" and a level range.
  await page.getByTestId("item-filter-change").getByRole("button", { name: /^New in Forever/ }).click();
  await expect(page).toHaveURL(/change=new/);
  await expect(rows.first().getByTestId("item-change-tag")).toHaveText("New in Forever");
  await page.getByLabel("Required level to").fill("40");
  await expect(page).toHaveURL(/rmax=40/);
  // A number past the top is pulled in to the level cap, and the box shows it.
  await page.getByLabel("Item level to").fill("3000");
  await expect(page).toHaveURL(/imax=300/);
  await expect(page.getByLabel("Item level to")).toHaveValue("300");

  await page.getByTestId("item-filters-reset").click();
  await expect(page).not.toHaveURL(/quality=|type=|change=|rmax=|imax=/);
  await expect(page.getByTestId("item-browser-count")).toContainText(countText(ALL_ITEMS));
});

test("sorting by name, flipping the order and the grid view stay in the URL", async ({ page }) => {
  await page.goto(ITEMS);
  const rows = page.getByTestId("item-browser-row");
  await page.getByRole("radio", { name: "Name" }).click();
  await expect(page).toHaveURL(/sort=name/);
  await expect(page.getByTestId("item-browser-direction")).toContainText("A to Z");
  const firstAZ = (await rows.first().getByRole("link").textContent()) ?? "";
  const secondAZ = (await rows.nth(1).getByRole("link").textContent()) ?? "";
  expect(firstAZ.localeCompare(secondAZ)).toBeLessThanOrEqual(0);

  await page.getByTestId("item-browser-direction").click();
  await expect(page).toHaveURL(/dir=desc/);
  await expect(page.getByTestId("item-browser-direction")).toContainText("Z to A");
  const firstZA = (await rows.first().getByRole("link").textContent()) ?? "";
  expect(firstZA.localeCompare(firstAZ)).toBeGreaterThan(0);

  await page.getByRole("radio", { name: "Grid" }).click();
  await expect(page).toHaveURL(/view=grid/);
  await expect(page.getByTestId("item-browser-card")).toHaveCount(PAGE_SIZE);
  await expect(rows).toHaveCount(0);
});

test("opening an item goes to its page, and Back returns to the same search", async ({ page }) => {
  await page.goto(`${ITEMS}?q=lionheart+helm`);
  const link = page.getByTestId("item-browser-row").getByRole("link", { name: "Lionheart Helm" });
  await link.hover();
  await expect(page.getByRole("tooltip")).toContainText("Lionheart Helm");
  await link.click();
  await expect(page).toHaveURL(/\/wow-forever\/items\/12640$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lionheart Helm" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Items" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/items\?q=lionheart\+helm$/);
  await expect(page.getByTestId("item-browser-row").filter({ hasText: "Lionheart Helm" })).toHaveCount(1);
});

test("Back from an item keeps the pages \"Show more\" opened; a new filter starts over", async ({ page }) => {
  await page.goto(ITEMS);
  const rows = page.getByTestId("item-browser-row");
  await page.getByTestId("item-browser-more").click();
  await expect(rows).toHaveCount(PAGE_SIZE * 2);
  await expect(page).toHaveURL(/pages=2/);
  await rows.nth(PAGE_SIZE + 1).getByRole("link").click();
  await expect(page).toHaveURL(/\/wow-forever\/items\/\d+$/);
  await page.getByRole("link", { name: "Back to Items" }).click();
  await expect(rows).toHaveCount(PAGE_SIZE * 2);

  await page.getByTestId("item-filter-quality").getByRole("button", { name: /^Rare/ }).click();
  await expect(page).not.toHaveURL(/pages=/);
  await expect(rows).toHaveCount(PAGE_SIZE);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("filters fold behind one button; the list fits a phone with 44px controls", async ({ page }) => {
    await page.goto(ITEMS);
    await expect(page.getByTestId("item-browser-row")).toHaveCount(PAGE_SIZE);
    const panel = page.getByTestId("item-filters");
    const toggle = page.getByTestId("item-filters-toggle");
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveText("Filters");
    expect(await noSideways(page)).toBeLessThanOrEqual(0);

    await toggle.click();
    await expect(panel).toBeVisible();
    await panel.getByTestId("item-filter-quality").getByRole("button", { name: /^Rare/ }).click();
    await expect(toggle).toHaveText("Filters (1)");
    expect(await noSideways(page)).toBeLessThanOrEqual(0);

    for (const box of [
      await toggle.boundingBox(),
      await page.getByLabel("Search items by name").boundingBox(),
      await page.getByTestId("item-browser-row").first().getByRole("link").boundingBox(),
      await panel.getByTestId("item-filter-slot").getByRole("button").first().boundingBox(),
      await page.getByTestId("item-browser-direction").boundingBox(),
    ]) {
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("radio", { name: "Grid" }).click();
    await expect(page.getByTestId("item-browser-card").first()).toBeVisible();
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
  });
});

test("the skeleton shows while the index loads, then the list replaces it", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/itemIndex\.json/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(ITEMS);
  const skeleton = page.getByTestId("item-browser-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(skeleton.getByTestId("item-browser-skeleton-row")).toHaveCount(8);
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("item-browser-row").first()).toBeVisible();
});
