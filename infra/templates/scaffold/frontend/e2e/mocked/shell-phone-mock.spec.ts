/**
 * No-backend E2E for the signed-in shell on a phone: the sidebar gives way to
 * a bottom navigation whose links fit the screen and are big enough to tap,
 * nothing scrolls sideways, and tapping a link lands on its page.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { PHONE_VIEWPORT } from "@platform/ui/test-support/constants/phoneViewport";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { LANDING_HEADING } from "./constants/signInCopy";
import { SHELL_PAGES } from "./constants/shellPages";

test.use({ viewport: PHONE_VIEWPORT, hasTouch: true, isMobile: true });

test("the shell fits a phone, with a bottom navigation in reach", async ({ page }) => {
  await stubSignedInShell(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: LANDING_HEADING, level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(SHELL_PAGES.length);

  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box, "the link is laid out").not.toBeNull();
    expect(box!.x, "the link starts on screen").toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, "the link ends on screen").toBeLessThanOrEqual(PHONE_VIEWPORT.width);
    expect(box!.y + box!.height, "the link sits above the bottom edge").toBeLessThanOrEqual(PHONE_VIEWPORT.height);
    expect(box!.height, "the link is tall enough to tap").toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "nothing scrolls sideways").toBeLessThanOrEqual(0);

  await nav.getByRole("link", { name: "Settings" }).tap();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});
