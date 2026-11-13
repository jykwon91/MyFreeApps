/**
 * Holds GET /scenarios, measures the loading skeleton's rows, lets the list
 * load, and checks each placeholder row sits exactly where the loaded row it
 * stands in for does (x, y, width, height), so nothing moves on arrival.
 */
import { expect, type Page } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { BOX_TOLERANCE_PX } from "../constants/layoutTolerance";
import { SCENARIOS } from "./catalogFixtures";
import { signedInTutor } from "./signedInTutor";

const SIDES = ["x", "y", "width", "height"] as const;

export async function expectSkeletonRowsLineUp(page: Page): Promise<void> {
  await signedInTutor(page);
  const gate = createGate();
  // Registered after the stub, so it runs first: hold the list, then let the stub answer.
  await page.route(/\/api\/scenarios(\?|$)/, async (route) => {
    await gate.wait;
    await route.fallback();
  });

  try {
    await page.goto("/scenarios");
    const skeleton = page.getByLabel("Loading scenarios");
    await expect(skeleton).toBeVisible();
    const skeletonRows = skeleton.getByRole("listitem");
    // A fixed few placeholder rows stand in for the path, which is longer.
    const placeholders = await skeletonRows.count();
    expect(placeholders).toBeGreaterThan(1);
    expect(placeholders).toBeLessThanOrEqual(SCENARIOS.length);
    const skeletonBoxes = await Promise.all(
      Array.from({ length: placeholders }, (_, index) => skeletonRows.nth(index).boundingBox()),
    );

    gate.release();
    const loadedRows = page.getByRole("main").getByRole("listitem");
    await expect(loadedRows).toHaveCount(SCENARIOS.length);
    await expect(skeleton).toHaveCount(0);
    for (const [index, skeletonBox] of skeletonBoxes.entries()) {
      const loadedBox = await loadedRows.nth(index).boundingBox();
      expect(skeletonBox, `skeleton row ${index}`).not.toBeNull();
      expect(loadedBox, `loaded row ${index}`).not.toBeNull();
      for (const side of SIDES) {
        expect(Math.abs(loadedBox![side] - skeletonBox![side]), `row ${index} ${side}`).toBeLessThanOrEqual(BOX_TOLERANCE_PX);
      }
    }
  } finally {
    gate.release();
  }
}
