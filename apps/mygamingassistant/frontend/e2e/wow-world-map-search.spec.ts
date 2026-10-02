/**
 * WoW Forever World Map — search a destination, get directions from anywhere, and say where you are in words.
 *
 * Run: npm run test:e2e -- wow-world-map-search
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.evaluate(() => window.localStorage.clear());
});

test("search an NPC by name and get directions to them from your location", async ({ page }) => {
  await page.goto("/wow-forever/map");
  await page.getByRole("combobox", { name: "Where are you?" }).fill("Goldshire");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByText(/You're around Goldshire, Elwynn Forest/)).toBeVisible();

  const search = page.getByRole("combobox", { name: "Find an NPC or place" });
  await search.fill("ryback");
  await page.getByRole("option", { name: /Stephen Ryback/ }).click();

  const card = page.getByRole("article", { name: "Stephen Ryback" });
  await expect(card).toContainText("78.2, 53.1");
  // The map opened Stormwind City on the destination.
  await expect(page.getByRole("img", { name: "Stormwind City map" })).toBeVisible();

  await card.getByRole("button", { name: "Directions" }).click();
  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByLabel("From")).toHaveValue("Your location");
  await expect(planner.getByRole("list", { name: "Directions" })).toContainText("(78.2, 53.1)");
  await expect(page.getByLabel("Start: Your location")).toBeVisible();
  await expect(page.getByLabel("Destination: Stephen Ryback")).toBeVisible();
});

test("plain vendors are searchable: Old Man Heming in Booty Bay, a flight away", async ({ page }) => {
  await page.getByRole("combobox", { name: "Where are you?" }).fill("Goldshire");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.getByRole("combobox", { name: "Find an NPC or place" }).fill("Old Man Heming");
  await page.getByRole("option", { name: /Old Man Heming/ }).click();
  const card = page.getByRole("article", { name: "Old Man Heming" });
  await expect(card).toContainText("Booty Bay");
  await expect(card).toContainText("27.4, 77.2");
  await card.getByRole("button", { name: "Directions" }).click();

  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByRole("list", { name: "Directions" })).toContainText("Fly from Stormwind, Elwynn to Booty Bay");
  await expect(planner.getByText(/Flight paths must be discovered first/)).toBeVisible();
  await expect(page.getByTestId("zone-map").getByLabel("Destination: Old Man Heming")).toBeVisible();
});

test("travel without flight paths: None takes the tram, Only ones I know lists flight paths to tick", async ({ page }) => {
  await page.getByRole("combobox", { name: "Where are you?" }).fill("Stormwind");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.getByRole("combobox", { name: "Find an NPC or place" }).fill("Gryth Thurden");
  await page.getByRole("option", { name: /Gryth Thurden/ }).click();
  await page.getByRole("article", { name: "Gryth Thurden" }).getByRole("button", { name: "Directions" }).click();

  const planner = page.getByRole("region", { name: "Route planner" });
  const flights = planner.getByRole("radiogroup", { name: "Flight paths" });
  await flights.getByRole("radio", { name: "None" }).click();
  const steps = planner.getByRole("list", { name: "Directions" });
  await expect(steps).toContainText("Take the tram (Stormwind - Ironforge)");
  await expect(steps).not.toContainText("Fly from");

  await flights.getByRole("radio", { name: "Only ones I know" }).click();
  await expect(planner.getByText(/No flight paths ticked/)).toBeVisible();
  await planner.getByRole("checkbox", { name: "Stormwind, Elwynn" }).check();
  await expect(planner.getByText(/1 of \d+ ticked/)).toBeVisible();
  // Remembered on the next visit.
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Route planner" }).getByRole("radio", { name: "Only ones I know" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("directions from a typed starting point, without a saved location", async ({ page }) => {
  await page.goto("/wow-forever/map");
  const search = page.getByRole("combobox", { name: "Find an NPC or place" });
  await search.fill("ryback");
  await search.press("Enter");
  await page.getByRole("article", { name: "Stephen Ryback" }).getByRole("button", { name: "Directions" }).click();

  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByText("Enter a starting point to see directions.")).toBeVisible();
  const from = planner.getByLabel("From");
  await from.fill("Goldshire");
  await from.press("Enter");
  await expect(planner.getByRole("list", { name: "Directions" })).toContainText("(78.2, 53.1)");
  // The trip is in the URL, so it can be shared or reloaded.
  await expect(page).toHaveURL(/to=npc/);
  await expect(page).toHaveURL(/from=place/);
  await page.reload();
  await expect(page.getByRole("region", { name: "Route planner" }).getByRole("list", { name: "Directions" })).toContainText("(78.2, 53.1)");
  // A typed start never changes where you are.
  await expect(page.getByText(/Say where you are above/)).toBeVisible();
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
  await expect(page.getByRole("article", { name: "Stephen Ryback" })).toBeVisible();
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
  await page.getByRole("article", { name: "Stephen Ryback" }).getByRole("button", { name: "Directions" }).click();

  await where.fill("42.1, 65.9");
  await where.press("Enter");
  await page.getByRole("button", { name: "Read those inside Stormwind City? Use the Stormwind City map" }).click();
  await expect(page.getByLabel("Zone")).toHaveValue("1453");
  await expect(page.getByText(/42\.1, 65\.9 on the Stormwind City map/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Route planner" }).getByRole("list", { name: "Directions" })).toBeVisible();
});

test('"warlock trainer" marks every warlock trainer on the zoomed-out map', async ({ page }) => {
  const search = page.getByRole("combobox", { name: "Find an NPC or place" });
  await search.fill("warlock trainer");
  await page.getByRole("option", { name: /Show all \d+ on the map/ }).click();

  const results = page.getByRole("region", { name: /“warlock trainer” on the map/ });
  await expect(results.getByText(/\d+ matches — every one is marked on the map/)).toBeVisible();
  // Zoomed out to the continent: several points; trainers standing together are one numbered marker.
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
  const map = page.getByTestId("zone-map");
  await expect(map.getByRole("button", { name: /^3 here: .*Briarthorn/ })).toBeVisible();

  // The number opens Ironforge, where the three stand apart.
  await map.getByRole("button", { name: /^3 here: .*Briarthorn/ }).click();
  await expect(page.getByRole("img", { name: "Ironforge map" })).toBeVisible();
  await expect(map.getByRole("button", { name: /<Warlock Trainer> — Class trainer$/ })).toHaveCount(3);

  // A marker picks its row.
  await map.getByRole("button", { name: /^Thistleheart <Warlock Trainer>/ }).click();
  await expect(results.getByRole("article", { name: "Thistleheart" })).toHaveAttribute("aria-current", "true");
});
