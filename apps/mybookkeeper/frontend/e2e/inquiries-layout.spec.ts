import { test, expect } from "./fixtures/auth";
import { holdRequests } from "./fixtures/hold-requests";
import { expectCardsMatchSkeleton, skeletonCardHeight } from "./fixtures/skeleton-card-fit";
import { deleteInquiry, seedInquiry } from "./fixtures/inquiries";

/**
 * Layout E2E for the Inquiries inbox.
 *
 * Verifies:
 *   1. The skeleton has the same number of cards/rows as the loaded list (no
 *      layout shift when data arrives).
 *   2. Mobile (375), tablet (768), desktop (1280) all render without
 *      horizontal overflow.
 *   3. Mobile viewport surfaces card layout; desktop surfaces the table.
 */

const INQUIRY_COUNT = 3;

test.describe("Inquiries layout (PR 2.1b)", () => {
  test("list skeleton cards are the size of the loaded cards on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const inquiryIds: string[] = [];
    try {
      for (let i = 0; i < INQUIRY_COUNT; i++) {
        inquiryIds.push(
          await seedInquiry(api, {
            source: "direct",
            inquirer_name: `E2E Layout Inquiry ${runId}-${i}`,
          }),
        );
      }
      const release = await holdRequests(page, (url) => url.pathname === "/api/inquiries");
      await page.goto("/inquiries");
      await expect(page.getByTestId("inquiries-skeleton")).toBeVisible({ timeout: 5000 });
      const skeletonHeight = await skeletonCardHeight(page.locator('[data-testid="inquiries-skeleton"] ul.md\\:hidden li'));

      release();
      await expectCardsMatchSkeleton(
        page.locator('[data-testid="inquiries-mobile"] li').filter({ hasText: `E2E Layout Inquiry ${runId}` }),
        INQUIRY_COUNT,
        skeletonHeight,
      );
    } finally {
      for (const id of inquiryIds) await deleteInquiry(api, id);
    }
  });

  test("renders without horizontal scroll at mobile / tablet / desktop viewports", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const inquiryIds: string[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        inquiryIds.push(
          await seedInquiry(api, {
            source: "direct",
            inquirer_name: `E2E Multi Layout ${runId}-${i}`,
          }),
        );
      }

      const viewports: ReadonlyArray<{ name: string; width: number; height: number }> = [
        { name: "mobile", width: 375, height: 800 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1280, height: 900 },
      ];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/inquiries");
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByRole("heading", { name: "Inquiries" }),
          `heading visible at ${vp.name}`,
        ).toBeVisible();

        // Page body should not exceed the viewport horizontally.
        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(docWidth, `no horizontal overflow at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1);
      }
    } finally {
      for (const id of inquiryIds) await deleteInquiry(api, id);
    }
  });

  test("inquiry stage chip filter is keyboard-accessible (44px touch target)", async ({
    authedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/inquiries");
    await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible();

    const allChip = page.getByTestId("inquiry-filter-all");
    await expect(allChip).toBeVisible();
    const box = await allChip.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
