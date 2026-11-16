/**
 * WoW Forever World Map — Theater mode.
 *
 * Theater mode keeps the same page and makes the map about three times bigger:
 * the page widens, the map column takes most of it, and the list stays beside it.
 * This spec verifies:
 *   - the map grows in place, the rest of the page stays usable (no overlay, nothing inert)
 *   - it's remembered across a reload
 *   - search, zone switching, directions and Esc all still work
 *   - phone width at 360px has no horizontal scroll
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-world-map-theater
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { hideMapLayers } from "./fixtures/mapLayers";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { THEATER_MODE_STORAGE_KEY } from "../../src/games/wow-forever/data/worldMap/mapTheaterMode";

// Suppress API calls the spec does not explicitly stub.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

// ── helpers ──────────────────────────────────────────────────────────────────

/** Set up an Alliance Warlock in Elwynn, Goldshire position, then navigate. */
async function setupWarlock(page: Page, url = "/wow-forever/map") {
  await hideMapLayers(page);
  await page.goto(url);
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class", { exact: true }).selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByRole("combobox", { name: "Where are you?" }).fill("/way 42 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();
}

function mapPanel(page: Page) {
  return page.locator("#wm-map-panel");
}

async function enterTheaterMode(page: Page) {
  await page.getByRole("button", { name: "Theater mode" }).click();
  await expect(mapPanel(page).locator("section[data-full-size]")).toBeVisible();
}

async function mapWidth(page: Page) {
  const box = await page.getByTestId("zone-map").boundingBox();
  if (!box) throw new Error("no map");
  return box.width;
}

// ── the map grows on the same page ───────────────────────────────────────────

test("theater mode makes the map much bigger on the same page, and back", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1000 });
  await setupWarlock(page);
  const before = await mapWidth(page);

  await enterTheaterMode(page);
  expect(await mapWidth(page)).toBeGreaterThan(before * 2);
  // Still the World Map page: no overlay, the list and the rest of the page are there and usable.
  await expect(page.getByTestId("theater-overlay")).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nearest services" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Map: / })).toBeVisible();

  await page.getByRole("button", { name: "Exit theater mode" }).click();
  await expect(mapPanel(page).locator("section[data-full-size]")).toHaveCount(0);
  expect(await mapWidth(page)).toBeCloseTo(before, 0);
});

test("theater mode is remembered in localStorage and survives a reload", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  await page.reload();
  await expect(mapPanel(page).locator("section[data-full-size]")).toBeVisible();

  await page.evaluate((key) => localStorage.setItem(key, "false"), THEATER_MODE_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("button", { name: "Theater mode" })).toBeVisible();
  await expect(mapPanel(page).locator("section[data-full-size]")).toHaveCount(0);
});

// ── the rest of the page still works ─────────────────────────────────────────

test("in theater mode, searching a place and clicking a result works", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  const planner = page.getByRole("region", { name: "Route planner" });
  const searchInput = planner.getByLabel("Find an NPC or place");
  await searchInput.fill("Stormwind");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option").first().click();

  await expect(planner).toBeVisible();
  await expect(mapPanel(page).locator("section[data-full-size]")).toBeVisible();
});

test("in theater mode, switching zone via breadcrumb keeps it on", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  await mapPanel(page).getByRole("button", { name: /Zoom out/ }).click();
  await expect(mapPanel(page).locator("section[data-full-size]")).toBeVisible();
  await expect(mapPanel(page).getByRole("img", { name: /map/i }).first()).toBeVisible();
});

test("in theater mode, Route there shows the directions", async ({ page }) => {
  // ?npc= pre-sets Maximillian Crowe (the Elwynn warlock trainer) as the destination.
  await setupWarlock(page, "/wow-forever/map?npc=906");
  await enterTheaterMode(page);

  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByText("Maximillian Crowe")).toBeVisible();
  await planner.getByRole("button", { name: "Directions" }).click();
  await expect(planner.getByRole("list", { name: "Directions" })).toBeVisible();
  await expect(mapPanel(page).locator("section[data-full-size]")).toBeVisible();
});

// ── Esc exits theater mode ───────────────────────────────────────────────────

test("Esc exits theater mode and the same map zone is still shown", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  await page.keyboard.press("Escape");
  await expect(mapPanel(page).locator("section[data-full-size]")).toHaveCount(0);
  await expect(mapPanel(page).getByRole("img", { name: /Elwynn Forest map/ })).toBeVisible();
});

// ── phone width: no horizontal scroll ────────────────────────────────────────

test("at 360px width there is no horizontal overflow in theater mode", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setupWarlock(page);
  await enterTheaterMode(page);

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding tolerance
});
