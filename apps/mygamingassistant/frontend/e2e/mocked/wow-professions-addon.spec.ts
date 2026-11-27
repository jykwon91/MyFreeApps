/**
 * The Professions page offers the MGA Professions addon: the card opens, the download button hands over the zip.
 * Frontend-only; API calls this spec does not stub answer 404.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-professions-addon
 */
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test("the Professions page downloads the MGA Professions addon", async ({ page }) => {
  await page.goto("/wow-forever/professions");
  const card = page.getByTestId("professions-addon");
  await card.getByText("Professions addon: these guides in your game").click();
  await expect(card).toContainText(String.raw`World of Warcraft\_forever_\Interface\AddOns`);
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("professions-addon-download").click()]);
  expect(download.suggestedFilename()).toBe("MGAProfessions.zip");
  const files = unzipSync(readFileSync(await download.path()));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["MGAProfessions/Data.lua", "MGAHub/MGAHub.toc", "MGAHub/Bindings.xml"]));
  expect(strFromU8(files["MGAProfessions/MGAProfessions.toc"])).toContain("## Dependencies: MGAHub\n## SavedVariables: MGAProfessionsSettings\n");
  expect(strFromU8(files["MGAProfessions/MGAProfessions.lua"])).toContain('BINDING_NAME_MGA_PROFESSIONS = "Open MGA Professions"');
});

test("on a phone the MGA Professions download is a full touch target and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wow-forever/professions");
  const card = page.getByTestId("professions-addon");
  await card.locator("summary").click();
  const button = await card.getByTestId("professions-addon-download").boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
