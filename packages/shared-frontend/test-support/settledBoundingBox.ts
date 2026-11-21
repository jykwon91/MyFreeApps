import type { Locator } from "@playwright/test";

/**
 * `locator`'s box once the page's finite animations (a panel or dialog
 * sliding or scaling open) have finished, so a size check never reads a box
 * that is still a fraction short mid-animation. Looping animations such as
 * spinners are ignored. For E2E tests only.
 */
export async function settledBoundingBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number } | null> {
  await locator.evaluate((element) =>
    Promise.all(
      element.ownerDocument
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  return locator.boundingBox();
}
