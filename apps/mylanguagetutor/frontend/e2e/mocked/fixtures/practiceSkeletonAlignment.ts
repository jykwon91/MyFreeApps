/**
 * Holds GET /scenarios, measures the practice skeleton's three sections, lets the
 * scenario load, and checks each section of the conversation sits where its
 * placeholder did (column and start), so nothing moves when it arrives. Heights
 * are left out: the goal text wraps with the copy and the width.
 */
import { expect, type Page } from "@playwright/test";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { expectBoxesLineUp, measureBoxes } from "@platform/ui/test-support/layoutShift";
import { holdReads } from "@platform/ui/test-support/routeControls";
import { GREETINGS } from "./catalogFixtures";
import { signedInTutor } from "./signedInTutor";

/**
 * Each section, and the sides of its box that must hold. The header starts where the skeleton's does;
 * what follows it moves with the header's height (the goals wrap onto more rows on a phone) and the
 * composer sticks to the bottom, so those two are held to their column only.
 */
const SECTIONS = [
  { id: "practice-header", sides: ["x", "y", "width"] },
  { id: "practice-transcript", sides: ["x", "width"] },
  { id: "practice-composer", sides: ["x", "width"] },
] as const;

export async function expectPracticeSkeletonSectionsLineUp(page: Page): Promise<void> {
  await signedInTutor(page);
  // Registered after the stub, so it runs first: hold the list, then let the stub answer.
  const gate = await holdReads(page, /\/api\/scenarios(\?|$)/);

  try {
    await page.goto(practicePath(GREETINGS.slug));
    const skeleton = page.getByLabel("Loading scenarios");
    await expect(skeleton).toBeVisible();
    const skeletonBoxes = [];
    for (const { id } of SECTIONS) skeletonBoxes.push(await measureBoxes(skeleton.getByTestId(id)));

    gate.release();
    await expect(page.getByRole("heading", { name: GREETINGS.title })).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    for (const [index, { id, sides }] of SECTIONS.entries()) {
      await expectBoxesLineUp(skeletonBoxes[index], page.getByTestId(id), sides);
    }
  } finally {
    gate.release();
  }
}
