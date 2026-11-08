/**
 * WoW Forever dungeon pages — the index, one dungeon's page (when you can go,
 * where it is, directions, the wing breakdown), boss deep links, the World Map
 * link, loot tooltips, the phone layout and the loading skeletons.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-dungeons
 */
import { test, expect, type Page } from "@playwright/test";

const DEADMINES = "/wow-forever/dungeons/deadmines";

async function noSideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("the index lists the dungeons lowest level first and opens one", async ({ page }) => {
  await page.goto("/wow-forever/dungeons");
  await expect(page.getByRole("heading", { level: 1, name: "Dungeons" })).toBeVisible();
  const rows = page.getByTestId("dungeon-list-row");
  await expect(rows.first()).toContainText("Ragefire Chasm");
  await expect(rows.filter({ hasText: "Molten Core" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Dungeons" }).getByTestId("provenance-badge")).toHaveCount(2);

  await rows.filter({ hasText: "Deadmines" }).click();
  await expect(page).toHaveURL(DEADMINES);
  await expect(page.getByRole("heading", { level: 1, name: "Deadmines" })).toBeVisible();
  await expect(page).toHaveTitle(/Deadmines/);
  const when = page.getByRole("region", { name: "When you can go" });
  await expect(when.getByText("Level 16", { exact: true })).toBeVisible();
  await expect(when.getByText("Level 10", { exact: true })).toBeVisible();
  await expect(when.getByText("Up to 10 players")).toBeVisible();
  await expect(when.getByText("None. Only the level.")).toBeVisible();

  // The left nav carries the page.
  await expect(page.getByRole("link", { name: "Dungeons" }).first()).toBeVisible();
});

test("a boss deep link opens the page scrolled to that boss; the jump list moves between bosses", async ({ page }) => {
  await page.goto(`${DEADMINES}#boss-edwin-vancleef`);
  const vancleef = page.locator("#boss-edwin-vancleef");
  await expect(vancleef.getByRole("heading", { name: /Edwin VanCleef/ })).toBeInViewport();

  await page.getByRole("navigation", { name: "Bosses" }).getByRole("link", { name: /Sneed$/ }).click();
  await expect(page).toHaveURL(`${DEADMINES}#boss-sneed`);
  await expect(page.locator("#boss-sneed").getByRole("heading")).toBeInViewport();
});

test("the entrance links to its zone on the World Map", async ({ page }) => {
  await page.goto(DEADMINES);
  const link = page.getByTestId("dungeon-entrance").getByRole("link", { name: "Show entrance on the World Map" });
  await expect(link).toHaveAttribute("href", "/wow-forever/map?m=1436");
  await link.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?m=1436/);
});

test("where it is: the nearest flight paths, then walking directions to the door", async ({ page }) => {
  await page.goto(DEADMINES);
  const where = page.getByRole("region", { name: "Where it is" });
  await expect(where.getByTestId("dungeon-flight-paths")).toContainText("Alliance: Sentinel Hill, Westfall");
  await expect(where.getByTestId("dungeon-flight-paths")).toContainText("yd");
  const directions = where.getByRole("link", { name: "Directions to the entrance" });
  await expect(directions).toHaveAttribute("href", /^\/wow-forever\/map\?to=pt%3A1436%2C[\d.]+%2C[\d.]+&dir=1$/);
  await directions.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A1436/);
  await expect(page.getByRole("link", { name: "Directions to the entrance" })).toHaveCount(0);
});

test("a dungeon with wings lists each door with the bosses behind it", async ({ page }) => {
  await page.goto("/wow-forever/dungeons/scarlet-monastery");
  await expect(page.getByRole("region", { name: "When you can go" })).toContainText("The Scarlet Key");
  const armory = page.getByTestId("dungeon-door").filter({ hasText: "Armory" });
  await expect(armory.getByRole("link", { name: "Directions to the Armory door" })).toBeVisible();
  const inside = armory.getByRole("button", { name: /Inside · bosses & routes/ });
  await expect(inside).toHaveAttribute("aria-expanded", "false");
  await inside.click();
  await expect(inside).toHaveAttribute("aria-expanded", "true");
  await expect(armory.getByRole("region", { name: "Inside Scarlet Monastery" })).toContainText("Herod");
});

test("Gnomeregan lists its five bosses in order, with drops and a route inside", async ({ page }) => {
  await page.goto("/wow-forever/dungeons/gnomeregan");
  const jump = page.getByRole("navigation", { name: "Bosses" }).getByRole("link");
  await expect(jump).toHaveText([/Grubbis$/, /Viscous Fallout$/, /Electrocutioner 6000$/, /Crowd Pummeler 9-60$/, /Mekgineer Thermaplugg$/]);
  await expect(page.locator("#boss-mekgineer-thermaplugg").getByTestId("boss-loot-row").first()).toContainText("%");
  await expect(page.getByText("The boss list for this dungeon isn't in our data yet.")).toHaveCount(0);
  const inside = page.getByTestId("dungeon-door").first().getByRole("button", { name: /Inside · bosses & routes/ });
  await inside.click();
  await expect(page.getByRole("region", { name: "Inside Gnomeregan" }).first()).toContainText("Mekgineer Thermaplugg");
});

test("hovering a loot item shows its tooltip; a click opens its item page", async ({ page }) => {
  await page.goto(DEADMINES);
  const row = page.locator("#boss-edwin-vancleef").getByTestId("boss-loot-row").filter({ hasText: "Cape of the Brotherhood" });
  await expect(row).toContainText("%");
  const name = row.getByRole("link", { name: "Cape of the Brotherhood" });
  await name.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip.getByTestId("item-stats")).toContainText("Cape of the Brotherhood");
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  await name.click();
  await expect(page).toHaveURL("/wow-forever/items/5193");
});

test("every fact carries a provenance badge and nothing links to Wowhead", async ({ page }) => {
  await page.goto(DEADMINES);
  // Recommended level, group size (Game files); lowest level, key (Classic data). Deadmines has no locked doors.
  await expect(page.getByRole("region", { name: "When you can go" }).getByTestId("dungeon-fact")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "When you can go" }).getByTestId("provenance-badge")).toHaveCount(4);
  // The entrances (Classic data) and the flight paths (Game files).
  await expect(page.getByRole("region", { name: "Where it is" }).getByTestId("provenance-badge")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Bosses" }).getByTestId("provenance-badge")).toHaveCount(1);
  await expect(page.locator("#boss-sneed").getByTestId("provenance-badge")).toHaveCount(1);
  await expect(page.locator('a[href*="wowhead"]')).toHaveCount(0);
});

test("an unknown dungeon says so and links back to the index", async ({ page }) => {
  await page.goto("/wow-forever/dungeons/no-such-place");
  await expect(page.getByTestId("dungeon-not-found")).toBeVisible();
  await page.getByRole("link", { name: "See every dungeon" }).click();
  await expect(page).toHaveURL("/wow-forever/dungeons");
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the index and a dungeon page fit the phone with no sideways scroll", async ({ page }) => {
    await page.goto("/wow-forever/dungeons");
    await expect(page.getByTestId("dungeon-list-row").first()).toBeVisible();
    expect(await noSideways(page)).toBeLessThanOrEqual(0);

    await page.goto("/wow-forever/dungeons/scarlet-monastery");
    await expect(page.getByTestId("dungeon-door").filter({ hasText: "Armory" })).toBeVisible();
    const directions = page.getByRole("link", { name: "Directions to the Armory door" });
    expect((await directions.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await noSideways(page)).toBeLessThanOrEqual(0);
    const box = await page.getByTestId("boss-loot-row").first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test("the skeletons show while the dungeon data loads, then the page", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The data files only — the page's own code also lives under data/dungeons/.
  await page.route(/data\/dungeons\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(DEADMINES);
  const skeleton = page.getByTestId("dungeon-page-skeleton");
  await expect(skeleton).toBeVisible();
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Deadmines" })).toBeVisible();
});

test("the index skeleton shows while the data loads", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/dungeons\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto("/wow-forever/dungeons");
  const skeleton = page.getByTestId("dungeon-list-skeleton");
  await expect(skeleton).toBeVisible();
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByTestId("dungeon-list-row").first()).toBeVisible();
});
