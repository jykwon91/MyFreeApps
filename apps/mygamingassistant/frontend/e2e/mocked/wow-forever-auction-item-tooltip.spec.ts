/**
 * WoW Forever Auction house item tooltip — E2E, network-stubbed.
 *
 *   - hovering a ring's name shows its in-game stats beside BOTH worn rings, with the stat deltas
 *     (green gain, red loss), inside the viewport; leaving hides it
 *   - with no saved character it shows the stats and how to compare, and the pointer can reach the link
 *   - a character that fails to load is a short note, never a crash
 *   - at 375px a tap opens it (stacked, inside the viewport, no sideways scroll) and a tap elsewhere closes it
 *
 * Stubbed: `/wow/prices` and `/wow/characters/<slug>`. The saved character is the player's localStorage entry.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-auction-item-tooltip
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PLAYER_KEY = "mga.wowForever.worldMap.player.v1";
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const UPDATED_AT = "2026-11-13T09:00:00Z";
const NOW = new Date("2026-11-13T12:00:00Z");

// Real Forever items: the ring on the auction house, and the two rings the character wears.
const PRECISION_RING = 1491; // +6 Agility, +3 Spirit
const DEFIAS_RING = 1076; // +4 Agility, +6 Stamina
const FREEZING_BAND = 942; // +13 Frost spell damage

const PRICE_ROWS: [number, string][] = [
  [PRECISION_RING, "Ring of Precision"],
  [FREEZING_BAND, "Freezing Band"],
];

function worn(slot: string, id: number, name: string) {
  return {
    slot, item_id: id, name, quality: "rare", item_level: 30,
    inventory_type: "FINGER", inventory_type_name: "Finger", subclass_name: null,
    binding: null, armor: null, weapon: null, stats: [], enchantments: [], spells: [], set_name: null,
    requirements: [], durability: null, durability_low: false, description: null,
  };
}

const CHARACTER = {
  slug: "jason-kwon",
  name: "Jason",
  surname: "Kwon",
  items: [worn("FINGER_1", DEFIAS_RING, "Defias Renegade Ring"), worn("FINGER_2", FREEZING_BAND, "Freezing Band")],
};

async function saveCharacter(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PLAYER_KEY, JSON.stringify({ faction: "A", classId: "warlock", zoneId: null, level: 37, position: null, characterSlug: "jason-kwon" })],
  );
}

async function stubPrices(page: Page): Promise<void> {
  await page.route("**/wow/prices**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        region: "us",
        server: "pvp",
        faction: "alliance",
        source_updated_at: UPDATED_AT,
        fetched_at: UPDATED_AT,
        columns: COLUMNS,
        items: PRICE_ROWS.map(([id, name]) => [id, 5000, 4500, 20, 4, name]),
      }),
    }),
  );
}

async function stubCharacter(page: Page, status = 200): Promise<{ asked: () => number }> {
  let asked = 0;
  await page.route(
    (url) => /\/wow\/characters\/[^/]+$/.test(url.pathname),
    (route) => {
      asked += 1;
      return status === 200
        ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify(CHARACTER) })
        : route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ detail: "blizzard_unavailable" }) });
    },
  );
  return { asked: () => asked };
}

async function rowName(page: Page, name: string): Promise<Locator> {
  await page.goto("/wow-forever/auction-house");
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  return button;
}

async function expectInsideViewport(page: Page, tooltip: Locator): Promise<void> {
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// Any API call this spec does not stub (icons, server status, ...) answers 404.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
  await page.clock.setFixedTime(NOW);
  await stubPrices(page);
});

test("hovering a ring compares it with both worn rings: green gains, red losses; leaving hides it", async ({ page }) => {
  await saveCharacter(page);
  const character = await stubCharacter(page);
  const name = await rowName(page, "Ring of Precision");
  expect(character.asked()).toBe(0);

  await name.hover();
  const tooltip = page.getByTestId("item-compare-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByTestId("item-stats")).toContainText("Ring of Precision");
  await expect(tooltip.getByText("Compared with Jason Kwon's gear")).toBeVisible();

  const blocks = tooltip.getByTestId("item-compare-block");
  await expect(blocks).toHaveCount(2);
  const defias = blocks.filter({ hasText: "Defias Renegade Ring" });
  await expect(defias.getByText("+2 Agility")).toHaveAttribute("data-gain", "true");
  await expect(defias.getByText("+3 Spirit")).toHaveAttribute("data-gain", "true");
  await expect(defias.getByText("−6 Stamina")).toHaveAttribute("data-gain", "false");
  const band = blocks.filter({ hasText: "Freezing Band" });
  await expect(band.getByText("+6 Agility")).toBeVisible();
  await expect(band.getByText("−13 Frost spell damage")).toHaveAttribute("data-gain", "false");
  expect(character.asked()).toBe(1);

  // On a wide screen the equipped gear sits beside the item, not under it.
  const stats = await tooltip.getByTestId("item-stats").boundingBox();
  const first = await blocks.first().boundingBox();
  expect(stats && first && first.x >= stats.x + stats.width - 1).toBe(true);

  await expectInsideViewport(page, tooltip);
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});

test("hovering a ring you already wear says there are no stat changes", async ({ page }) => {
  await saveCharacter(page);
  await stubCharacter(page);
  const name = await rowName(page, "Freezing Band");
  await name.hover();
  const tooltip = page.getByTestId("item-compare-tooltip");
  await expect(tooltip.getByTestId("item-compare-block").filter({ hasText: "Freezing Band" }).getByText("No stat changes")).toBeVisible();
});

test("with no saved character it shows the stats and how to compare, and the link can be clicked", async ({ page }) => {
  const character = await stubCharacter(page);
  const name = await rowName(page, "Ring of Precision");
  await name.hover();
  const tooltip = page.getByTestId("item-compare-tooltip");
  await expect(tooltip.getByTestId("item-stats")).toContainText("Ring of Precision");
  await expect(tooltip.getByTestId("item-compare-no-character")).toContainText(
    "Compare with your gear: look up your character and press Use for MGA's pages.",
  );
  expect(character.asked()).toBe(0);

  // The pointer can travel from the name onto the tooltip and use its link.
  await tooltip.getByRole("link", { name: "Look up your character" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/character$/);
});

test("the name is a 44px target, and the keyboard opens the dialog, reaches its link, and Escape returns", async ({ page }) => {
  await stubCharacter(page);
  const name = await rowName(page, "Ring of Precision");
  const box = await name.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);

  await name.focus();
  const tooltip = page.getByTestId("item-compare-tooltip");
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toBeFocused();
  await expect(name).toHaveAttribute("aria-controls", /.+/);

  // The item's data loads after the dialog opens; its link is there once it has.
  const link = tooltip.getByRole("link", { name: "Look up your character" });
  await expect(link).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(tooltip).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(name).toBeFocused();
});

test("a character that fails to load is a short note, and the item's stats still show", async ({ page }) => {
  await saveCharacter(page);
  await stubCharacter(page, 502);
  const name = await rowName(page, "Ring of Precision");
  await name.hover();
  const tooltip = page.getByTestId("item-compare-tooltip");
  await expect(tooltip.getByTestId("item-stats")).toContainText("Ring of Precision");
  await expect(tooltip).toContainText("Couldn't load your character's gear");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test("a tap opens it stacked inside the screen, and a tap elsewhere closes it", async ({ page }) => {
    await saveCharacter(page);
    await stubCharacter(page);
    const name = await rowName(page, "Ring of Precision");

    await name.tap();
    const tooltip = page.getByTestId("item-compare-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByTestId("item-compare-block")).toHaveCount(2);
    await expect(name).toHaveAttribute("aria-expanded", "true");

    // Stacked: the equipped blocks sit below the item's own stats, not beside them.
    const stats = await tooltip.getByTestId("item-stats").boundingBox();
    const first = await tooltip.getByTestId("item-compare-block").first().boundingBox();
    expect(stats && first && first.y >= stats.y + stats.height - 1).toBe(true);

    await expectInsideViewport(page, tooltip);
    await expectNoSidewaysScroll(page);

    await page.getByRole("heading", { level: 1 }).first().tap();
    await expect(tooltip).toHaveCount(0);
    await expect(name).toHaveAttribute("aria-expanded", "false");
  });

  test("a second tap on the name closes it", async ({ page }) => {
    const name = await rowName(page, "Ring of Precision");
    await name.tap();
    await expect(page.getByTestId("item-compare-tooltip")).toBeVisible();
    await name.tap();
    await expect(page.getByTestId("item-compare-tooltip")).toHaveCount(0);
  });
});
