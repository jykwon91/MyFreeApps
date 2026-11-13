/**
 * Checks that what replaces a placeholder lands where the placeholder was, so
 * nothing moves when it arrives. For E2E tests only.
 *
 * Measure the skeleton's boxes while it shows (measureBoxes), let the data
 * arrive, then compare the loaded elements to them (expectBoxesLineUp). Pass
 * only the sides that should match: a loaded card whose height depends on its
 * data still has to sit in the skeleton card's column (x, width) and start
 * where it started (y).
 */
import { expect, type Locator } from "@playwright/test";
import { BOX_SIDES } from "./constants/boxSides";
import { LAYOUT_SHIFT_TOLERANCE_PX } from "./constants/layoutShiftTolerance";
import type { BoxSide } from "./types/BoxSide";
import type { LayoutBox } from "./types/LayoutBox";

/** Every element `items` matches, measured now; each must be rendered. */
export async function measureBoxes(items: Locator): Promise<LayoutBox[]> {
  const count = await items.count();
  expect(count, "something to measure").toBeGreaterThan(0);
  const boxes: LayoutBox[] = [];
  for (let index = 0; index < count; index++) {
    const box = await items.nth(index).boundingBox();
    expect(box, `box ${index} is rendered`).not.toBeNull();
    boxes.push(box!);
  }
  return boxes;
}

/** The first `expected.length` elements of `items` sit on `expected`, side by side, within LAYOUT_SHIFT_TOLERANCE_PX. */
export async function expectBoxesLineUp(
  expected: LayoutBox[],
  items: Locator,
  sides: readonly BoxSide[] = BOX_SIDES,
): Promise<void> {
  for (const [index, want] of expected.entries()) {
    const got = await items.nth(index).boundingBox();
    expect(got, `box ${index} is rendered`).not.toBeNull();
    for (const side of sides) {
      expect(Math.abs(got![side] - want[side]), `box ${index} ${side}`).toBeLessThanOrEqual(LAYOUT_SHIFT_TOLERANCE_PX);
    }
  }
}
