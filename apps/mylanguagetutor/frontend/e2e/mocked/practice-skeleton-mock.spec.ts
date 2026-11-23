/**
 * No-backend E2E for the practice screen's loading skeleton: while the scenario
 * loads, its header, transcript and composer sit where the loaded page's do.
 */
import { test } from "@platform/ui/test-support/crashGuard";
import { PHONE_VIEWPORT, TABLET_VIEWPORT } from "./constants/viewports";
import { expectPracticeSkeletonSectionsLineUp } from "./fixtures/practiceSkeletonAlignment";

test("while the practice scenario loads, each skeleton section sits where the loaded section does", async ({ page }) => {
  await expectPracticeSkeletonSectionsLineUp(page);
});

test.describe("on a small phone", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("each skeleton section still sits where its loaded section does", async ({ page }) => {
    await expectPracticeSkeletonSectionsLineUp(page);
  });
});

test.describe("on a portrait tablet, beside the sidebar", () => {
  test.use({ viewport: TABLET_VIEWPORT });

  test("each skeleton section still sits where its loaded section does", async ({ page }) => {
    await expectPracticeSkeletonSectionsLineUp(page);
  });
});
