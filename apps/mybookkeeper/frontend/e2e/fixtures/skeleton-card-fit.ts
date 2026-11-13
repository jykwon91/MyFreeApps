import { expect, type Locator } from "@playwright/test";
import { expectBoxesLineUp, measureBoxes } from "@platform/ui/test-support/layoutShift";
import type { LayoutBox } from "@platform/ui/test-support/types/LayoutBox";

/** The first skeleton card's box, measured while the skeleton is still on screen. */
export async function skeletonCardBox(skeletonCards: Locator): Promise<LayoutBox> {
  const [box] = await measureBoxes(skeletonCards.first());
  expect(box.height, "the skeleton card has a height").toBeGreaterThan(0);
  return box;
}

/**
 * Checks the cards this test seeded are the skeleton card's height. Lists are
 * shared with other specs running in parallel, so card count and position say
 * nothing; card size is what keeps the swap from shifting the page.
 */
export async function expectCardsMatchSkeleton(ourCards: Locator, expectedCount: number, skeletonCard: LayoutBox): Promise<void> {
  await expect(ourCards).toHaveCount(expectedCount);
  await expectBoxesLineUp([skeletonCard], ourCards, ["height"]);
}
