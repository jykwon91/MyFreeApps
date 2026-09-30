/**
 * WoW Forever World Map — find an NPC or place, and say where you are in words.
 *
 * Run: npm run test:e2e -- wow-world-map-search
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.evaluate(() => window.localStorage.clear());
});

test("search an NPC by name and get directions to them", async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.getByRole("combobox", { name: "Where are you?" }).fill("Goldshire");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByText(/You're around Goldshire, Elwynn Forest/)).toBeVisible();

  const search = page.getByRole("combobox", { name: "Find an NPC or place" });
  await search.fill("ryback");
  await page.getByRole("option", { name: /Stephen Ryback/ }).click();

  const card = page.getByRole("region", { name: "Going to" });
  await expect(card.getByRole("heading", { name: "Stephen Ryback" })).toBeVisible();
  await expect(card.getByRole("list", { name: "Directions" })).toContainText("(78.2, 53.1)");
  // The map opened Stormwind City with the marker chosen.
  await expect(page.getByRole("img", { name: "Stormwind City map" })).toBeVisible();
});

test("minimap text puts you on the city's map", async ({ page }) => {
  await page.goto("/wow-forever/map");
  const where = page.getByRole("combobox", { name: "Where are you?" });
  await where.fill("Old Town 78.4, 53.2");
  await where.press("Enter");
  await expect(page.getByLabel("Zone")).toHaveValue("1453");
  await expect(page.getByText(/78\.4, 53\.2 on the Stormwind City map/)).toBeVisible();
});

test("a Cooking trainer's Show on map link opens the map on them", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  await page.getByRole("link", { name: "Show Stephen Ryback on the map" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?npc=5482/);
  await expect(page.getByRole("region", { name: "Going to" }).getByRole("heading", { name: "Stephen Ryback" })).toBeVisible();
});

test("the phone layout never scrolls sideways with the search open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/map");
  await page.getByRole("combobox", { name: "Find an NPC or place" }).fill("flight master");
  await expect(page.getByRole("listbox")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("coordinates read inside a city can be moved onto the city's map while going somewhere", async ({ page }) => {
  await page.goto("/wow-forever/map");
  const where = page.getByRole("combobox", { name: "Where are you?" });
  await where.fill("Goldshire");
  await where.press("Enter");
  const search = page.getByRole("combobox", { name: "Find an NPC or place" });
  await search.fill("ryback");
  await search.press("Enter");
  await expect(page.getByRole("region", { name: "Going to" })).toBeVisible();

  await where.fill("42.1, 65.9");
  await where.press("Enter");
  await page.getByRole("button", { name: "Read those inside Stormwind City? Use the Stormwind City map" }).click();
  await expect(page.getByLabel("Zone")).toHaveValue("1453");
  await expect(page.getByText(/42\.1, 65\.9 on the Stormwind City map/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Going to" }).getByRole("list", { name: "Directions" })).toBeVisible();
});
