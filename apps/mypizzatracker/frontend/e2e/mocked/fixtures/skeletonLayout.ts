/**
 * Checks a page's loading skeleton has the loaded page's layout: one
 * placeholder per loaded section, in the same column (x, width), starting
 * where the content starts (the first one's y), and, in a single column, with
 * the same gap between neighbours so nothing below the first box moves.
 * Heights follow the data, so they aren't compared.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { LAYOUT_SHIFT_TOLERANCE_PX } from "@platform/ui/test-support/constants/layoutShiftTolerance";
import { expectBoxesLineUp, measureBoxes } from "@platform/ui/test-support/layoutShift";
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

/** Space between a box and the one above it; negative when they overlap vertically. */
function gapAbove(boxes: LayoutBox[], index: number): number {
  return boxes[index].y - (boxes[index - 1].y + boxes[index - 1].height);
}

/** Two boxes stack in one column when the second sits at or below the first's bottom, at the same x. */
function stackedBelow(boxes: LayoutBox[], index: number): boolean {
  return (
    Math.abs(boxes[index].x - boxes[index - 1].x) <= LAYOUT_SHIFT_TOLERANCE_PX &&
    gapAbove(boxes, index) >= -LAYOUT_SHIFT_TOLERANCE_PX
  );
}

/** Each skeleton box stacked under its neighbour has the same gap above it in `loaded`. A grid's row gaps follow its box heights, so they're skipped. */
async function expectSameGaps(skeleton: LayoutBox[], loaded: Locator): Promise<void> {
  const loadedBoxes = await measureBoxes(loaded);
  for (let index = 1; index < skeleton.length; index++) {
    if (!stackedBelow(skeleton, index)) continue;
    expect(
      Math.abs(gapAbove(loadedBoxes, index) - gapAbove(skeleton, index)),
      `gap above box ${index}`,
    ).toBeLessThanOrEqual(LAYOUT_SHIFT_TOLERANCE_PX);
  }
}

/** `loaded` has one element per measured skeleton box, each in its column and with the same gaps between them, the first starting where the skeleton did. */
export async function expectSameColumns(skeleton: LayoutBox[], loaded: Locator): Promise<void> {
  await expect(loaded).toHaveCount(skeleton.length);
  await expectBoxesLineUp(skeleton, loaded, ["x", "width"]);
  await expectBoxesLineUp(skeleton.slice(0, 1), loaded, ["y"]);
  await expectSameGaps(skeleton, loaded);
}
