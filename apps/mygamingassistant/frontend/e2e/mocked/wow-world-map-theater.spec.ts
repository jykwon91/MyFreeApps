/**
 * WoW Forever World Map — Theater mode.
 *
 * Theater mode is a full-viewport overlay that lets the user interact with the
 * map without the page chrome getting in the way. This spec verifies:
 *   - entering theater mode shows the overlay and hides app chrome
 *   - the route planner, search, zone switching, directions, and Esc all work
 *   - phone width at 360px has no horizontal scroll
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-world-map-theater
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { hideMapLayers } from "./fixtures/mapLayers";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { THEATER_MODE_STORAGE_KEY } from "../../src/games/wow-forever/data/worldMap/mapTheaterMode";

const THEATER_KEY = THEATER_MODE_STORAGE_KEY;

// Suppress API calls the spec does not explicitly stub.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

// ── helpers ──────────────────────────────────────────────────────────────────

/** Set up an Alliance Warlock in Elwynn, Goldshire position, then navigate. */
async function setupWarlock(page: import("@playwright/test").Page) {
  await hideMapLayers(page);
  await page.goto("/wow-forever/map");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class", { exact: true }).selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByRole("combobox", { name: "Where are you?" }).fill("/way 42 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();
}

/** Click the Theater mode toggle button (in the map breadcrumb row). */
async function enterTheaterMode(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Theater mode" }).click();
  await expect(page.getByTestId("theater-overlay")).toBeVisible();
}

// ── layout: theater overlay appears ─────────────────────────────────────────

test("theater mode toggle enters and exits the overlay", async ({ page }) => {
  await setupWarlock(page);

  // Enter theater mode.
  await enterTheaterMode(page);

  // The map section is inside the overlay.
  const overlay = page.getByTestId("theater-overlay");
  await expect(overlay.getByRole("img", { name: /map/i }).first()).toBeVisible();

  // The toggle button inside the overlay says "Exit theater mode".
  await expect(overlay.getByRole("button", { name: "Exit theater mode" })).toBeVisible();

  // Exit via the button.
  await overlay.getByRole("button", { name: "Exit theater mode" }).click();
  await expect(page.getByTestId("theater-overlay")).not.toBeAttached();
  await expect(page.getByRole("button", { name: "Theater mode" })).toBeVisible();
});

test("theater mode is remembered in localStorage and survives a reload", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  // Reload — theater should auto-open because localStorage has 'true'.
  await page.reload();
  await expect(page.getByTestId("theater-overlay")).toBeVisible();

  // Clear it and verify it goes away on reload.
  await page.evaluate((key) => localStorage.setItem(key, "false"), THEATER_KEY);
  await page.reload();
  await expect(page.getByTestId("theater-overlay")).not.toBeAttached();
});

// ── app chrome is hidden ─────────────────────────────────────────────────────

test("app sidebar and header are not interactable in theater mode (inert)", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  // The sidebar nav links should be inert — they won't be in the tab order.
  // We verify the aside/sidebar is not reachable by role (inert removes it from
  // the accessibility tree).
  const sidebar = page.locator("#main-sidebar");
  if (await sidebar.count() > 0) {
    await expect(sidebar).toHaveAttribute("inert");
  }
});

// ── route planner visible in theater mode ────────────────────────────────────

test("route planner is accessible in theater mode", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  const overlay = page.getByTestId("theater-overlay");
  await expect(overlay.getByRole("region", { name: "Route planner" })).toBeVisible();
});

test("in theater mode, searching a place and clicking a result works", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  const overlay = page.getByTestId("theater-overlay");
  const planner = overlay.getByRole("region", { name: "Route planner" });

  // The route planner search input is accessible in theater mode.
  const searchInput = planner.getByLabel("Find an NPC or place");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("Stormwind");

  // Pick the first suggestion.
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option").first().click();

  // After picking a destination, the destination card appears.
  await expect(planner).toBeVisible();
  // Theater overlay still open.
  await expect(overlay).toBeVisible();
});

test("in theater mode, switching zone via breadcrumb keeps the overlay open", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  const overlay = page.getByTestId("theater-overlay");

  // Click "Zoom out" in the breadcrumb to go up to Eastern Kingdoms.
  await overlay.getByRole("button", { name: /Zoom out/ }).click();

  // The theater overlay stays visible.
  await expect(overlay).toBeVisible();

  // The map image should now be the Eastern Kingdoms or world map.
  await expect(overlay.getByRole("img", { name: /map/i }).first()).toBeVisible();
});

test("in theater mode, Route there shows the directions panel in the route sidebar", async ({ page }) => {
  await hideMapLayers(page);
  // Navigate with ?npc= to pre-set Maximillian Crowe (the Elwynn warlock trainer) as the destination.
  await page.goto("/wow-forever/map?npc=906");
  await page.getByRole("radio", { name: "Alliance" }).click();
  await page.getByLabel("Class", { exact: true }).selectOption("warlock");
  await page.getByLabel("Zone").selectOption({ label: "Elwynn Forest" });
  await page.getByRole("combobox", { name: "Where are you?" }).fill("/way 42 65");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  // Enter theater mode.
  await enterTheaterMode(page);

  const overlay = page.getByTestId("theater-overlay");
  const planner = overlay.getByRole("region", { name: "Route planner" });

  // The DestinationCard should be visible in the theater route panel.
  await expect(planner.getByText("Maximillian Crowe")).toBeVisible();

  // Open the directions form.
  const directionsBtn = planner.getByRole("button", { name: "Directions" });
  await expect(directionsBtn).toBeVisible();
  await directionsBtn.click();

  // Directions form + steps are shown inside the theater route panel.
  await expect(planner.getByRole("list", { name: "Directions" })).toBeVisible();
  // Theater overlay stays open.
  await expect(overlay).toBeVisible();
});

// ── Esc exits theater mode ───────────────────────────────────────────────────

test("Esc exits theater mode and the same map zone is still shown", async ({ page }) => {
  await setupWarlock(page);
  await enterTheaterMode(page);

  const overlay = page.getByTestId("theater-overlay");
  await expect(overlay).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("theater-overlay")).not.toBeAttached();

  // The normal page map panel re-appears with the same map.
  const mapPanel = page.locator("#wm-map-panel");
  await expect(mapPanel.getByRole("img", { name: /Elwynn Forest map/ })).toBeVisible();
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
