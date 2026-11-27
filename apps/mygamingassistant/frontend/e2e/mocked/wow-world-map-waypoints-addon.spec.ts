/**
 * The World Map page offers the MGA Waypoints addon: the card opens, the download button hands over the zip.
 * Frontend-only; API calls this spec does not stub answer 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-world-map-waypoints-addon
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the World Map page downloads the MGA Waypoints addon", async ({ page }) => {
  await page.goto("/wow-forever/map");
  const card = page.getByTestId("waypoints-addon");
  await card.getByText("Waypoint arrow addon: pick a place, follow the arrow").click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("waypoints-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGAWaypoints.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["MGAWaypoints/Data.lua", "MGAHub/MGAHub.toc", "MGAHub/Bindings.xml"]));
  expect(strFromU8(files["MGAWaypoints/MGAWaypoints.toc"])).toContain("## Dependencies: MGAHub\n## SavedVariables: MGAWaypointsSettings\n");
  expect(strFromU8(files["MGAWaypoints/MGAWaypoints.lua"])).toContain('SLASH_MGAWAYPOINTS1 = "/mgawp"');
});

test("on a phone the MGA Waypoints download is a full touch target and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wow-forever/map");
  const card = page.getByTestId("waypoints-addon");
  await card.locator("summary").click();
  const button = await card.getByTestId("waypoints-addon-download").boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
