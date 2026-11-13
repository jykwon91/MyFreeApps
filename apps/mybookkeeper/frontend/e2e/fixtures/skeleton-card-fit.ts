import { expect, type Locator } from "@playwright/test";
import { LAYOUT_SHIFT_TOLERANCE_PX } from "@platform/ui/test-support/constants/layoutShiftTolerance";

/** The first skeleton card's height, measured while the skeleton is still on screen. */
export async function skeletonCardHeight(skeletonCards: Locator): Promise<number> {
  expect(await skeletonCards.count(), "the skeleton shows at least one card").toBeGreaterThan(0);
  const box = await skeletonCards.first().boundingBox();
  expect(box, "skeleton card has a box").not.toBeNull();
  expect(box!.height).toBeGreaterThan(0);
  return box!.height;
}

/**
 * Checks the cards this test seeded are the skeleton card's height. Lists are
 * shared with other specs running in parallel, so card count says nothing;
 * card size is what keeps the swap from shifting the page.
 */
export async function expectCardsMatchSkeleton(ourCards: Locator, expectedCount: number, skeletonHeight: number): Promise<void> {
  await expect(ourCards).toHaveCount(expectedCount);
  const box = await ourCards.first().boundingBox();
  expect(box, "loaded card has a box").not.toBeNull();
  expect(Math.abs(skeletonHeight - box!.height)).toBeLessThanOrEqual(LAYOUT_SHIFT_TOLERANCE_PX);
}
