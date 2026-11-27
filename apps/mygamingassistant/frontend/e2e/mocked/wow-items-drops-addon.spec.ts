/**
 * The Items page offers the MGA Drops addon: the card opens, says the chances are Classic's, and the download
 * button hands over MGADrops.zip with the generated drop data, the GPL licence that comes with it, no
 * Bindings.xml, and the MGAHub folder it depends on. Frontend-only; API calls this spec does not stub answer 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-items-drops-addon
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const ITEMS = "/wow-forever/items";
const SUMMARY = "Drops addon: what a mob drops and how often, in its tooltip";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the Items page downloads MGA Drops with Classic's drop chances inside", async ({ page }) => {
  await page.goto(ITEMS);
  const card = page.getByTestId("drops-addon");
  await card.getByText(SUMMARY).click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  await expect(card).toContainText("WoW Forever may differ");
  await expect(card).toContainText("/mgadrops");
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("drops-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGADrops.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files).filter((path) => !path.endsWith("/")).sort()).toEqual(
    [
      ...["Core.lua", "Data.lua", "LICENSE", "MGADrops.lua", "MGADrops.toc", "Window.lua"].map((name) => `MGADrops/${name}`),
      ...["Bindings.xml", "MGAHub.lua", "MGAHub.toc"].map((name) => `MGAHub/${name}`),
    ].sort(),
  );
  const data = strFromU8(files["MGADrops/Data.lua"]);
  expect(data).toContain('[448] = {"Hogger", 11, 11,');
  expect(data).toContain('{1931, 100, "quest"}');
  expect(strFromU8(files["MGADrops/LICENSE"])).toContain("GNU GENERAL PUBLIC LICENSE");
  expect(strFromU8(files["MGADrops/MGADrops.toc"])).toContain("## Dependencies: MGAHub\n## SavedVariables: MGADropsSettings\n");
  await expect(page.getByText("MGA Drops is downloading. Unzip it into your AddOns folder.", { exact: true })).toBeVisible();
});

test("on a phone the MGA Drops download is a full touch target and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ITEMS);
  const card = page.getByTestId("drops-addon");
  await card.locator("summary").click();
  const summary = await card.locator("summary").boundingBox();
  expect(summary!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  const button = await card.getByTestId("drops-addon-download").boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
