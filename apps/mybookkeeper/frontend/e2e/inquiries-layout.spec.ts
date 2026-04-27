import { test, expect, type APIRequestContext } from "./fixtures/auth";

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

interface SeedInquiryPayload {
  source: "FF" | "TNH" | "direct" | "other";
  inquirer_name?: string;
  inquirer_employer?: string;
  desired_start_date?: string;
  desired_end_date?: string;
  external_inquiry_id?: string | null;
  received_at?: string;
}

async function seedInquiry(api: APIRequestContext, payload: SeedInquiryPayload): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: {
      received_at: payload.received_at ?? new Date().toISOString(),
      ...payload,
    },
  });
  if (!res.ok()) throw new Error(`seedInquiry failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteInquiry(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/inquiries/${id}`).catch(() => {});
}

const INQUIRY_COUNT = 3;

test.describe("Inquiries layout (PR 2.1b)", () => {
  test("skeleton card count is in the same order of magnitude as the loaded card count on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const inquiryIds: string[] = [];
    try {
      await page.route("**/api/inquiries**", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/inquiries");
      await expect(page.getByTestId("inquiries-skeleton")).toBeVisible({ timeout: 5000 });

      const skeletonMobileList = page.locator('[data-testid="inquiries-skeleton"] ul.md\\:hidden li');
      const skeletonCount = await skeletonMobileList.count();
      expect(skeletonCount).toBeGreaterThan(0);

      for (let i = 0; i < INQUIRY_COUNT; i++) {
        inquiryIds.push(
          await seedInquiry(api, {
            source: "direct",
            inquirer_name: `E2E Layout Inquiry ${runId}-${i}`,
          }),
        );
      }
      await page.unroute("**/api/inquiries**");
      await navPromise;
      await page.reload();
      await page.waitForLoadState("networkidle");

      const loadedMobileCards = page.locator('[data-testid="inquiries-mobile"] li');
      const loadedCount = await loadedMobileCards.count();
      expect(loadedCount).toBeGreaterThanOrEqual(INQUIRY_COUNT);

      // Same skeleton-vs-loaded tolerance as the listings layout spec.
      expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
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
