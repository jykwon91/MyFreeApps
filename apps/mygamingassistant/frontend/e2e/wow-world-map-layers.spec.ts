/**
 * WoW Forever World Map layers — the Layers panel's counted toggles change
 * the markers and are remembered after a reload; "Where to level" tints the
 * continent's zones and its legend follows your level; zone level labels show
 * on a continent; on a phone the panel is a bottom sheet that opens and closes
 * with no sideways scroll.
 *
 * Frontend-only (static data + map art), so nothing is seeded; the capture
 * API is answered empty.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-world-map-layers
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { MAP_LAYERS_KEY } from "./fixtures/mapLayers";

const PLAYER_KEY = "mga.wowForever.worldMap.player.v1";
const ELWYNN = 1429;
const EASTERN_KINGDOMS = 1415;
const WESTFALL = 1436;
const PHONE = { width: 375, height: 812 };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
  // An Alliance Warlock with no zone picked: the map shows only the layers (no nearest-service results).
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [PLAYER_KEY, JSON.stringify({ faction: "A", classId: "warlock", zoneId: null, level: null, position: null })] as const,
  );
});

/** Every marker drawn on the map: single markers plus the members of numbered clusters. */
async function markerTotal(page: Page, mapName: string): Promise<number> {
  const group = page.getByRole("group", { name: `${mapName} markers` });
  const singles = await group.locator('g[role="button"]:not([data-testid="marker-cluster"])').count();
  const clusterLabels = await group.getByTestId("marker-cluster").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return singles + clusterLabels.reduce((sum, label) => sum + Number(label.split(" ")[0]), 0);
}

/** The number in a toggle's name: "Stable masters (3)" → 3. */
async function toggleCount(toggle: Locator): Promise<number> {
  const name = (await toggle.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? "")) || "";
  const match = name.match(/\((\d+)\)/);
  if (!match) throw new Error(`no count in "${name}"`);
  return Number(match[1]);
}

async function openLayers(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^Layers \(\d+\)/ }).click();
  const panel = page.getByRole("region", { name: "Map layers" });
  await expect(panel).toBeVisible();
  return panel;
}

test("a counted toggle changes the markers, and the choice survives a reload", async ({ page }) => {
  await page.goto(`/wow-forever/map?m=${ELWYNN}`);
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  const panel = await openLayers(page);

  // Defaults: flight masters, inns, class trainers and dungeons are on.
  await expect(panel.getByRole("checkbox", { name: /^Flight masters \(\d+\)/ })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: /^Warlock trainers \(\d+\)/ })).toBeChecked();

  const stables = panel.getByRole("checkbox", { name: /^Stable masters \(\d+\)/ });
  await expect(stables).not.toBeChecked();
  const stableCount = await toggleCount(stables);
  expect(stableCount).toBeGreaterThan(0);
  const before = await markerTotal(page, "Elwynn Forest");

  await stables.check();
  await expect.poll(() => markerTotal(page, "Elwynn Forest")).toBe(before + stableCount);
  await expect(page.getByRole("status").filter({ hasText: /Stable masters shown — \d+ on this map/ })).toBeAttached();
  await expect(page.getByRole("button", { name: "Layers (5)" })).toBeVisible();

  // Esc closes the panel and returns focus to the button.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Layers (5)" })).toBeFocused();

  await page.reload();
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Layers (5)" })).toBeVisible();
  const again = await openLayers(page);
  await expect(again.getByRole("checkbox", { name: /^Stable masters/ })).toBeChecked();
  await expect.poll(() => markerTotal(page, "Elwynn Forest")).toBe(before + stableCount);

  // A whole group off with None; its markers go.
  await again.getByRole("button", { name: "Hide all Travel" }).click();
  await expect(again.getByRole("checkbox", { name: /^Flight masters/ })).not.toBeChecked();
  await expect(again.getByRole("checkbox", { name: /^Stable masters/ })).not.toBeChecked();
  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), MAP_LAYERS_KEY);
  expect(stored.layers.stable_masters).toBe(false);
  expect(stored.layers.flight_masters).toBe(false);
});

test("Where to level tints the continent's zones and the legend follows your level", async ({ page }) => {
  await page.goto(`/wow-forever/map?m=${EASTERN_KINGDOMS}`);
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();

  // Zone labels: name + levels, with no level set yet.
  const labels = page.getByTestId("zone-label");
  await expect(labels.first()).toBeVisible();
  expect(await labels.count()).toBeGreaterThan(3);
  await expect(page.getByRole("list", { name: "Zone levels" })).toContainText(/\d+–\d+/);
  await expect(page.getByTestId("zone-fit-tint")).toHaveCount(0);

  const panel = await openLayers(page);
  await expect(panel.getByText("Enter your level to tint the zones.")).toBeVisible();
  await panel.getByLabel("Your level").fill("14");

  const westfall = page.locator(`[data-testid="zone-fit-tint"][data-zone="${WESTFALL}"]`);
  await expect(westfall).toHaveAttribute("data-fit", "right");
  await expect(page.locator(`[data-testid="zone-fit-tint"][data-zone="${ELWYNN}"]`)).toHaveAttribute("data-fit", "too_low");
  await expect(panel.getByTestId("level-fit-legend")).toBeVisible();
  await expect(page.getByTestId("level-fit-legend-compact")).toContainText("Zones for level 14");

  await panel.getByLabel("Your level").fill("30");
  await expect(westfall).toHaveAttribute("data-fit", "too_low");
  await expect(page.getByTestId("level-fit-legend-compact")).toContainText("Zones for level 30");
  // It's the same saved level as the You section.
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").level, PLAYER_KEY))
    .toBe(30);

  // Switching the tint off clears it; the labels stay.
  await panel.getByRole("checkbox", { name: "Tint zones by how well they fit my level" }).uncheck();
  await expect(page.getByTestId("zone-fit-tint")).toHaveCount(0);
  await expect(page.getByTestId("level-fit-legend-compact")).toHaveCount(0);
  await expect(labels.first()).toBeVisible();
});

test("on a phone the Layers panel is a bottom sheet that opens and closes, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`/wow-forever/map?m=${EASTERN_KINGDOMS}`);
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
  await expect(page.getByTestId("zone-label").first()).toBeVisible();

  const button = page.getByRole("button", { name: /^Layers \(\d+\)/ });
  const buttonBox = await button.boundingBox();
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);

  const panel = await openLayers(page);
  const sheet = await panel.boundingBox();
  if (!sheet) throw new Error("sheet not on screen");
  // Pinned to the bottom, full width, and leaves most of the screen above it.
  expect(sheet.x).toBeLessThanOrEqual(1);
  expect(sheet.width).toBeGreaterThanOrEqual(PHONE.width - 1);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(PHONE.height - 1);
  expect(sheet.height).toBeLessThanOrEqual(PHONE.height * 0.56);
  // The map stays in view above the sheet.
  const map = await page.getByTestId("zone-map").boundingBox();
  expect(map && map.y + map.height / 2).toBeLessThan(sheet.y);

  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await panel.getByRole("button", { name: "Close layers" }).click();
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
