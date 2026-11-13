/**
 * Holds GET /scenarios, measures the loading skeleton's rows, lets the list
 * load, and checks each placeholder row sits exactly where the loaded row it
 * stands in for does (x, y, width, height), so nothing moves on arrival.
 */
import { expect, type Page } from "@playwright/test";
import { expectBoxesLineUp, measureBoxes } from "@platform/ui/test-support/layoutShift";
import { holdReads } from "@platform/ui/test-support/routeControls";
import { SCENARIOS } from "./catalogFixtures";
import { signedInTutor } from "./signedInTutor";

export async function expectSkeletonRowsLineUp(page: Page): Promise<void> {
  await signedInTutor(page);
  // Registered after the stub, so it runs first: hold the list, then let the stub answer.
  const gate = await holdReads(page, /\/api\/scenarios(\?|$)/);

  try {
    await page.goto("/scenarios");
    const skeleton = page.getByLabel("Loading scenarios");
    await expect(skeleton).toBeVisible();
    const skeletonRows = skeleton.getByRole("listitem");
    // A fixed few placeholder rows stand in for the path, which is longer.
    const placeholders = await skeletonRows.count();
    expect(placeholders).toBeGreaterThan(1);
    expect(placeholders).toBeLessThanOrEqual(SCENARIOS.length);
    const skeletonBoxes = await measureBoxes(skeletonRows);

    gate.release();
    const loadedRows = page.getByRole("main").getByRole("listitem");
    await expect(loadedRows).toHaveCount(SCENARIOS.length);
    await expect(skeleton).toHaveCount(0);
    await expectBoxesLineUp(skeletonBoxes, loadedRows);
  } finally {
    gate.release();
  }
}
