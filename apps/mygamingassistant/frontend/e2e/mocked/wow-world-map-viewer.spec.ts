/**
 * WoW Forever World Map viewer — smooth zoom and pan on the zone art
 * (wheel, pinch, drag, + / − buttons, keyboard), zones still open on a click
 * while zoomed, and "Show on map" links from other pages land on their marker.
 *
 * Frontend-only (static map art), so nothing is seeded; the capture API is
 * answered empty.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-world-map-viewer
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { hideMapLayers } from "./fixtures/mapLayers";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PHONE = { width: 375, height: 812 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The element's box, once it has one (an SVG marker gets its box a frame after it's added). */
async function boxOf(locator: Locator): Promise<Box> {
  let box: Box | null = null;
  await expect
    .poll(async () => {
      box = await locator.boundingBox();
      return box !== null;
    })
    .toBe(true);
  if (!box) throw new Error("not on screen");
  return box;
}

/** How many times wider than the viewer the picture is drawn (1 = the whole picture fits). */
async function zoomRatio(page: Page, mapName: string): Promise<number> {
  const picture = await boxOf(page.getByRole("img", { name: `${mapName} map` }));
  const viewer = await boxOf(page.getByTestId("zone-map"));
  return picture.width / viewer.width;
}

/**
 * The picture ends up drawn at `ratio` times the viewer's width. Waits out the
 * zoom animation too (Leaflet marks it with a class): mid-zoom the ratio can
 * already be close, and a pan made then is dropped.
 */
async function expectZoom(page: Page, mapName: string, ratio: number) {
  await expect.poll(() => zoomRatio(page, mapName)).toBeCloseTo(ratio, 1);
  await expect(page.locator(".leaflet-zoom-anim")).toHaveCount(0);
  expect(await zoomRatio(page, mapName)).toBeCloseTo(ratio, 1);
}

/** The picture still covers the whole viewer: no empty gutter past the art's edges. */
async function expectPictureCoversViewer(page: Page, mapName: string) {
  const picture = await boxOf(page.getByRole("img", { name: `${mapName} map` }));
  const viewer = await boxOf(page.getByTestId("zone-map"));
  expect(picture.x).toBeLessThanOrEqual(viewer.x + 1);
  expect(picture.y).toBeLessThanOrEqual(viewer.y + 1);
  expect(picture.x + picture.width).toBeGreaterThanOrEqual(viewer.x + viewer.width - 1);
  expect(picture.y + picture.height).toBeGreaterThanOrEqual(viewer.y + viewer.height - 1);
}

function expectInside(inner: Box, outer: Box) {
  expect(inner.x + inner.width / 2).toBeGreaterThanOrEqual(outer.x);
  expect(inner.x + inner.width / 2).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height / 2).toBeGreaterThanOrEqual(outer.y);
  expect(inner.y + inner.height / 2).toBeLessThanOrEqual(outer.y + outer.height);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openElwynn(page: Page) {
  await page.goto("/wow-forever/map?m=1429");
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom the map in" })).toBeEnabled();
  // The mouse only reaches what's on screen.
  await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.beforeEach(async ({ page }) => {
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
});

test("the + and − buttons zoom the picture in steps, up to 4x, and Reset zoom shows it whole", async ({ page }) => {
  await openElwynn(page);
  const zoomIn = page.getByRole("button", { name: "Zoom the map in" });
  const zoomOut = page.getByRole("button", { name: "Zoom the map out" });
  const reset = page.getByRole("button", { name: "Reset zoom" });

  await expect(zoomOut).toBeDisabled();
  await expectZoom(page, "Elwynn Forest", 1);

  await zoomIn.click();
  await zoomIn.click();
  await expectZoom(page, "Elwynn Forest", 2);
  await expect(reset).toBeVisible();
  await expectPictureCoversViewer(page, "Elwynn Forest");

  await zoomOut.click();
  await expectZoom(page, "Elwynn Forest", Math.SQRT2);

  // Quick taps add up (none is lost to the zoom still running), and never past 4x the whole picture.
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await expectZoom(page, "Elwynn Forest", 4);

  await reset.click();
  await expectZoom(page, "Elwynn Forest", 1);
  await expect(reset).toHaveCount(0);
  // Zooming never navigated anywhere.
  await expect(page).toHaveURL(/[?&]m=1429/);
});

test("the wheel zooms towards the pointer and back out, without scrolling the page", async ({ page }) => {
  await openElwynn(page);
  const viewer = await boxOf(page.getByTestId("zone-map"));
  await page.mouse.move(viewer.x + viewer.width * 0.25, viewer.y + viewer.height * 0.25);
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await page.mouse.wheel(0, -400);
  await expect.poll(() => zoomRatio(page, "Elwynn Forest")).toBeGreaterThan(1.3);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  // Towards the pointer (top-left quarter): the picture grew down and right of it, not around the middle.
  const picture = await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }));
  expect(picture.x + picture.width / 2).toBeGreaterThan(viewer.x + viewer.width / 2);
  await expectPictureCoversViewer(page, "Elwynn Forest");

  await page.mouse.wheel(0, 2000);
  await expectZoom(page, "Elwynn Forest", 1);
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveCount(0);
});

test("a zoomed map drags around, stops at the art's edges, and a drag never counts as a click", async ({ page }) => {
  await openElwynn(page);
  await page.getByRole("button", { name: "Zoom the map in" }).click();
  await page.getByRole("button", { name: "Zoom the map in" }).click();
  await expectZoom(page, "Elwynn Forest", 2);

  const viewer = await boxOf(page.getByTestId("zone-map"));
  const before = await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }));
  const cx = viewer.x + viewer.width / 2;
  const cy = viewer.y + viewer.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 40, { steps: 8 });
  await page.mouse.move(cx + 120, cy + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }))).x).toBeGreaterThan(before.x + 60);

  // A huge drag only goes as far as the edge of the art.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 1500, cy + 1500, { steps: 20 });
  await page.mouse.up();
  await expectPictureCoversViewer(page, "Elwynn Forest");

  // Dragging didn't open Stormwind or any other map, and didn't move you.
  await expect(page.getByRole("img", { name: "Elwynn Forest map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1429/);
  const stored = await page.evaluate(() => window.localStorage.getItem("mga.wowForever.worldMap.player.v1"));
  expect(JSON.parse(stored ?? "{}").position ?? null).toBeNull();
});

test("the keyboard zooms with + / − and pans with the arrow keys", async ({ page }) => {
  await openElwynn(page);
  const map = page.getByTestId("zone-map");
  await map.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expectZoom(page, "Elwynn Forest", 2);

  const before = await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }))).x).toBeLessThan(before.x - 20);
  expect((await boxOf(page.getByRole("img", { name: "Elwynn Forest map" }))).y).toBeLessThan(before.y - 20);

  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await expectZoom(page, "Elwynn Forest", 1);
  // Esc still goes up to the continent.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
});

test("clicking a zone on a zoomed-in continent opens that zone", async ({ page }) => {
  // The click is on Westfall's ground, not on a layer marker standing there.
  await hideMapLayers(page);
  await page.goto("/wow-forever/map?m=1415");
  await expect(page.getByRole("img", { name: "Eastern Kingdoms map" })).toBeVisible();
  await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Zoom the map in" }).click();
  await expectZoom(page, "Eastern Kingdoms", Math.SQRT2);

  // Westfall's middle on the continent map is at about (41.4, 76.8) of the picture, wherever it's drawn now.
  const picture = await boxOf(page.getByRole("img", { name: "Eastern Kingdoms map" }));
  const at = { x: picture.x + picture.width * 0.414, y: picture.y + picture.height * 0.768 };
  await page.mouse.move(at.x, at.y);
  await expect(page.getByText(/Westfall · Level \d+–\d+ · Alliance territory — click to go there/)).toBeVisible();
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("img", { name: "Westfall map" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]m=1436/);
  // A new map opens whole.
  await expectZoom(page, "Westfall", 1);
});

test("an item page's dungeon directions land on the entrance marker", async ({ page }) => {
  await page.goto("/wow-forever/items/11815");
  await expect(page.getByRole("heading", { level: 1, name: "Hand of Justice" })).toBeVisible();
  await page.getByRole("link", { name: "Directions to Blackrock Depths entrance" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt%3A.+&dir=1/);

  const destination = page.getByTestId("zone-map").getByLabel(/^Destination: /);
  await expect(destination).toBeVisible();
  expectInside(await boxOf(destination), await boxOf(page.getByTestId("zone-map")));
});

test("a profession trainer's Show on map lands on that trainer's marker", async ({ page }) => {
  await page.goto("/wow-forever/professions?p=tailoring");
  const link = page.getByRole("link", { name: /^Show .+ on the map$/ }).first();
  const label = (await link.getAttribute("aria-label")) ?? "";
  const trainer = label.replace(/^Show /, "").replace(/ on the map$/, "");
  expect(trainer.length).toBeGreaterThan(0);
  await link.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?/);

  const destination = page.getByTestId("zone-map").getByLabel(`Destination: ${trainer}`);
  await expect(destination).toBeVisible();
  expectInside(await boxOf(destination), await boxOf(page.getByTestId("zone-map")));
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("the map fills the width, its zoom buttons are thumb-sized, pinch zooms and nothing scrolls sideways", async ({ page }) => {
    await openElwynn(page);
    await expectNoHorizontalOverflow(page);

    const viewer = await boxOf(page.getByTestId("zone-map"));
    // Full width, less the page gutters and the band the neighbour labels sit in.
    expect(viewer.width).toBeGreaterThan(PHONE.width * 0.7);
    expect(viewer.x + viewer.width).toBeLessThanOrEqual(PHONE.width);
    await expectZoom(page, "Elwynn Forest", 1);

    for (const name of ["Zoom the map in", "Zoom the map out"]) {
      const button = await boxOf(page.getByRole("button", { name }));
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    // Unzoomed, one finger still scrolls the page up and down.
    await expect(page.getByTestId("zone-map")).toHaveCSS("touch-action", "pan-y");

    await page.getByTestId("zone-map").scrollIntoViewIfNeeded();
    const at = await boxOf(page.getByTestId("zone-map"));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizePinchGesture", {
      x: at.x + at.width / 2,
      y: at.y + at.height / 2,
      scaleFactor: 2,
      gestureSourceType: "touch",
    });
    await expect.poll(() => zoomRatio(page, "Elwynn Forest")).toBeGreaterThan(1.3);
    await expect(page.getByRole("button", { name: "Reset zoom" })).toBeVisible();
    // Zoomed, a finger drags the map instead.
    await expect(page.getByTestId("zone-map")).toHaveCSS("touch-action", "none");
    // The pinch didn't open a map or set a position.
    await expect(page).toHaveURL(/[?&]m=1429/);
    await expectNoHorizontalOverflow(page);
  });
});
