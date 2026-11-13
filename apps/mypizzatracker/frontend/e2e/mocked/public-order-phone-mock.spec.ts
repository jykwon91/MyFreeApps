/**
 * No-backend E2E for /order on a phone: nothing scrolls sideways, the pickup
 * slots sit two to a row, and a customer can build and place an order with
 * the controls in reach, and the loading skeleton has the loaded cards.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { PHONE_VIEWPORT } from "@platform/ui/test-support/constants/phoneViewport";
import { measureBoxes } from "@platform/ui/test-support/layoutShift";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { holdReads } from "@platform/ui/test-support/routeControls";
import { CARD } from "./constants/layoutSelectors";
import { ORDER_PLACED_HEADING } from "./constants/publicCopy";
import { fillDetails } from "./fixtures/publicOrderForm";
import { expectSameColumns, skeletonCards } from "./fixtures/skeletonLayout";
import { stubPublicApi } from "./fixtures/stubPublicApi";

const CURRENT_DROP = apiPath(/^\/public\/drops\/current$/);

test.use({ viewport: PHONE_VIEWPORT, hasTouch: true, isMobile: true });

test("the order page fits a phone and an order can be placed from it", async ({ page }) => {
  const api = await stubUnmatchedApi(page).then(() => stubPublicApi(page));

  await page.goto("/order");
  const slots = page.getByRole("main").getByRole("button", { name: /^\d{1,2}:\d{2} [AP]M/ });
  await expect(slots).toHaveCount(4);
  const [first, second, third] = await Promise.all([0, 1, 2].map((i) => slots.nth(i).boundingBox()));
  expect(second!.y, "the second slot shares the first's row").toBeCloseTo(first!.y, 0);
  expect(third!.y, "the third slot starts the next row").toBeGreaterThan(first!.y + first!.height);
  expect(second!.x + second!.width, "the row fits the screen").toBeLessThanOrEqual(PHONE_VIEWPORT.width);

  await slots.nth(0).tap();
  await fillDetails(page, "Dana Cruz", "5125550199");
  const placeOrder = page.getByRole("button", { name: "Place order" });
  await placeOrder.scrollIntoViewIfNeeded();
  const button = await placeOrder.boundingBox();
  expect(button!.x, "Place order starts on screen").toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width, "Place order ends on screen").toBeLessThanOrEqual(PHONE_VIEWPORT.width);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "nothing scrolls sideways").toBeLessThanOrEqual(0);

  await placeOrder.tap();
  await expect(page.getByRole("heading", { name: ORDER_PLACED_HEADING })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test("on a phone the order page's skeleton has one card per loaded card, in their column", async ({ page }) => {
  await stubUnmatchedApi(page);
  await stubPublicApi(page);
  const gate = await holdReads(page, CURRENT_DROP);

  try {
    await page.goto("/order");
    const skeleton = skeletonCards(page);
    await expect(skeleton).toHaveCount(5);
    const boxes = await measureBoxes(skeleton);

    gate.release();
    await expect(skeleton).toHaveCount(0);
    await expectSameColumns(boxes, page.getByRole("main").locator(CARD));
  } finally {
    gate.release();
  }
});
