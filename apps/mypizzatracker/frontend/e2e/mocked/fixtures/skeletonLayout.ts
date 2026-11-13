/**
 * Checks a page's loading skeleton has the loaded page's layout: one
 * placeholder per loaded section, in the same column (x, width), starting
 * where the content starts (the first one's y). Heights follow the data, so
 * they aren't compared.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { expectBoxesLineUp } from "@platform/ui/test-support/layoutShift";
import type { LayoutBox } from "@platform/ui/test-support/types/LayoutBox";
import { CARD, SKELETON_BAR } from "../constants/layoutSelectors";

/** The main area's cards holding skeleton bars. */
export function skeletonCards(page: Page): Locator {
  return page.getByRole("main").locator(CARD).filter({ has: page.locator(SKELETON_BAR) });
}

/** The main area's skeleton bars that sit directly in it, outside any card. */
export function looseSkeletonBars(page: Page): Locator {
  return page.getByRole("main").locator(`${SKELETON_BAR}:not(${CARD} ${SKELETON_BAR})`);
}

/** `loaded` has one element per measured skeleton box, each in its column, the first starting where the skeleton did. */
export async function expectSameColumns(skeleton: LayoutBox[], loaded: Locator): Promise<void> {
  await expect(loaded).toHaveCount(skeleton.length);
  await expectBoxesLineUp(skeleton, loaded, ["x", "width"]);
  await expectBoxesLineUp(skeleton.slice(0, 1), loaded, ["y"]);
}
