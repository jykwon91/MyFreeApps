/**
 * The Legacy page offers the MGA Explorer addon for the Explorer challenge: the card opens, the download button hands
 * over one zip with MGA Explorer and the MGA Waypoints it needs. Frontend-only; API calls this spec does not stub answer 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-legacy-explorer-addon
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the Legacy page downloads MGA Explorer with MGA Waypoints beside it", async ({ page }) => {
  await page.goto("/wow-forever/legacy");
  const card = page.getByTestId("explorer-addon");
  await card.getByText("Explorer addon: what Explore Azeroth still needs, and an arrow to it").click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  await expect(card).toContainText("/mgaexplore");
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("explorer-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGAExplorer.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["MGAExplorer/Data.lua", "MGAExplorer/Core.lua", "MGAWaypoints/MGAWaypoints.toc"]));
  expect(strFromU8(files["MGAExplorer/MGAExplorer.toc"])).toContain("## Dependencies: MGAWaypoints");
  expect(strFromU8(files["MGAExplorer/Data.lua"])).toContain('"Tirisfal Glades"');
  await expect(page.getByText("MGA Explorer is downloading. Unzip it into your AddOns folder.", { exact: true })).toBeVisible();
});

test("on a phone the MGA Explorer download is a full touch target and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wow-forever/legacy");
  const card = page.getByTestId("explorer-addon");
  await card.locator("summary").click();
  const summary = await card.locator("summary").boundingBox();
  expect(summary!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const button = await card.getByTestId("explorer-addon-download").boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
