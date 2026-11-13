/**
 * WoW Forever World Map — the Map / Satellite toggle. The satellite pictures
 * live in object storage (`/api/wow/satellite/...`), so the API is stubbed: a
 * tiny image stands in for a zone's picture, or a 404 for one not published.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-world-map-satellite
 *
 * Alignment screenshots (local only): build the pictures with
 * `python -m scripts.wow_satellite.build`, then set MGA_SATELLITE_DIR to the
 * folder it printed and run the same command — the last test serves the real
 * pictures and saves Elwynn, Durotar and Stranglethorn, drawn and satellite,
 * with their markers to `test-results/satellite-alignment/`.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { MAP_STYLE_STORAGE_KEY } from "../../src/games/wow-forever/data/worldMap/mapStyle";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PHONE = { width: 375, height: 812 };
const ELWYNN = "/wow-forever/map?m=1429";
const IRONFORGE = "/wow-forever/map?m=1455";
// A 1x1 PNG: the browser decodes by content, so it stands in for the WebP.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function serveSatellite(page: Page) {
  await page.route("**/api/wow/satellite/**", (route) => route.fulfill({ status: 200, contentType: "image/webp", body: PIXEL }));
}

async function openMap(page: Page, url = ELWYNN) {
  await page.goto(url);
  await expect(page.getByTestId("map-art")).toBeVisible();
  await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
}

function styleRadio(page: Page, name: "Map" | "Satellite"): Locator {
  return page.getByRole("radiogroup", { name: "Map style" }).getByRole("radio", { name });
}

async function expectSatelliteShown(page: Page) {
  await expect(page.getByTestId("zone-map")).toHaveAttribute("data-map-style", "satellite");
  await expect(page.getByTestId("map-satellite")).toHaveCSS("opacity", "1");
  await expect(styleRadio(page, "Satellite")).toHaveAttribute("aria-checked", "true");
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
});

test("Satellite swaps the picture, and the choice survives a reload", async ({ page }) => {
  await serveSatellite(page);
  await openMap(page);
  await expect(page.getByTestId("map-satellite")).toHaveCount(0);
  await expect(styleRadio(page, "Map")).toHaveAttribute("aria-checked", "true");

  await styleRadio(page, "Satellite").click();
  await expectSatelliteShown(page);
  await expect(page.getByTestId("map-satellite")).toHaveAttribute("src", /\/api\/wow\/satellite\/[\d.]+\/1429\.webp$/);
  await expect(page.getByRole("img", { name: "Elwynn Forest satellite map" })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), MAP_STYLE_STORAGE_KEY)).toBe('"satellite"');

  await page.reload();
  await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
  await expectSatelliteShown(page);

  await styleRadio(page, "Map").click();
  await expect(page.getByTestId("zone-map")).toHaveAttribute("data-map-style", "drawn");
  await expect(page.getByTestId("map-satellite")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
});

test("markers stay on the same spot on screen when the picture changes", async ({ page }) => {
  await serveSatellite(page);
  await openMap(page);
  const marker = page.getByTestId("zone-map").locator("svg g[role=button]").first();
  await expect(marker).toBeVisible();
  const before = await marker.boundingBox();

  await styleRadio(page, "Satellite").click();
  await expectSatelliteShown(page);
  const after = await marker.boundingBox();
  expect(before && after).toBeTruthy();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(0.5);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(0.5);

  // The satellite picture covers exactly the drawn art's box.
  const art = await page.getByTestId("map-art").boundingBox();
  const satellite = await page.getByTestId("map-satellite").boundingBox();
  expect(satellite).toEqual(art);
});

test("a satellite picture that won't load falls back to the drawn map, with Try again", async ({ page }) => {
  let published = false;
  await page.route("**/api/wow/satellite/**", (route) =>
    published
      ? route.fulfill({ status: 200, contentType: "image/webp", body: PIXEL })
      : route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"Not Found"}' }),
  );
  await openMap(page);

  await styleRadio(page, "Satellite").click();
  await expect(page.getByRole("status").filter({ hasText: "The satellite view didn't load, so this is the drawn map." })).toBeVisible();
  await expect(page.getByTestId("zone-map")).toHaveAttribute("data-map-style", "drawn");
  await expect(page.getByTestId("map-satellite")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(styleRadio(page, "Map")).toHaveAttribute("aria-checked", "true");

  published = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expectSatelliteShown(page);
  await expect(page.getByText("The satellite view didn't load")).toHaveCount(0);
});

test("maps with no satellite view offer no toggle and keep the drawn map", async ({ page }) => {
  await serveSatellite(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, '"satellite"'), MAP_STYLE_STORAGE_KEY);
  await openMap(page, IRONFORGE);
  await expect(page.getByRole("radiogroup", { name: "Map style" })).toHaveCount(0);
  await expect(page.getByTestId("map-satellite")).toHaveCount(0);
  await expect(page.getByTestId("zone-map")).toHaveAttribute("data-map-style", "drawn");
});

test("arrow keys move the choice", async ({ page }) => {
  await serveSatellite(page);
  await openMap(page);
  await styleRadio(page, "Map").focus();
  await page.keyboard.press("ArrowRight");
  await expectSatelliteShown(page);
  await expect(styleRadio(page, "Satellite")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(styleRadio(page, "Map")).toHaveAttribute("aria-checked", "true");
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE });

  test("the toggle fits, has 44 px targets and the page doesn't scroll sideways", async ({ page }) => {
    await serveSatellite(page);
    await openMap(page);
    for (const name of ["Map", "Satellite"] as const) {
      const box = await styleRadio(page, name).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await styleRadio(page, "Satellite").click();
    await expectSatelliteShown(page);
    // The toggle doesn't sit on the zoom buttons.
    const toggle = await page.getByRole("radiogroup", { name: "Map style" }).boundingBox();
    const zoomIn = await page.getByRole("button", { name: "Zoom the map in" }).boundingBox();
    expect(toggle!.x + toggle!.width).toBeLessThan(zoomIn!.x);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

const SATELLITE_DIR = process.env.MGA_SATELLITE_DIR;
const ALIGNMENT_ZONES = [
  { id: 1429, name: "elwynn" },
  { id: 1411, name: "durotar" },
  { id: 1434, name: "stranglethorn" },
];

test("alignment screenshots from the real pictures", async ({ page }) => {
  test.skip(!SATELLITE_DIR, "set MGA_SATELLITE_DIR to the satellite build folder");
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.route("**/api/wow/satellite/**", (route) => {
    const file = path.join(SATELLITE_DIR!, path.basename(new URL(route.request().url()).pathname));
    return fs.existsSync(file)
      ? route.fulfill({ status: 200, contentType: "image/webp", body: fs.readFileSync(file) })
      : route.fulfill({ status: 404 });
  });
  for (const zone of ALIGNMENT_ZONES) {
    await openMap(page, `/wow-forever/map?m=${zone.id}`);
    if ((await styleRadio(page, "Satellite").getAttribute("aria-checked")) === "true") await styleRadio(page, "Map").click();
    await expect(page.getByTestId("map-satellite")).toHaveCount(0);
    await page.getByTestId("zone-map").screenshot({ path: `test-results/satellite-alignment/${zone.name}-map.png` });
    await styleRadio(page, "Satellite").click();
    await expectSatelliteShown(page);
    await page.getByTestId("zone-map").screenshot({ path: `test-results/satellite-alignment/${zone.name}-satellite.png` });
  }
});
