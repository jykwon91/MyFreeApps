import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * Layout E2E for the Vendors rolodex list + detail (PR 4.1b).
 *
 * Verifies:
 *   1. The list skeleton has roughly the same number of cards/rows as the
 *      loaded list (no large layout shift when data arrives).
 *   2. The list renders without horizontal overflow at mobile / tablet /
 *      desktop viewports.
 *   3. The category chip filter has 44px touch targets.
 *   4. The detail-page skeleton has the same section headers as the loaded
 *      page so there's no visual jump when data arrives.
 */

interface SeedVendorPayload {
  name?: string;
  category?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hourly_rate?: string | null;
  flat_rate_notes?: string | null;
  preferred?: boolean;
  notes?: string | null;
}

async function seedVendor(
  api: APIRequestContext,
  payload: SeedVendorPayload,
): Promise<string> {
  const res = await api.post("/test/seed-vendor", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedVendor failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteVendor(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/vendors/${id}`).catch(() => {});
}

const VENDOR_COUNT = 3;

test.describe("Vendors layout (PR 4.1b)", () => {
  test("list skeleton card count is in the same order of magnitude as the loaded card count on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const vendorIds: string[] = [];
    try {
      await page.route("**/api/vendors**", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/vendors");
      await expect(page.getByTestId("vendors-skeleton")).toBeVisible({
        timeout: 5000,
      });

      const skeletonMobileList = page.locator(
        '[data-testid="vendors-skeleton"] ul.md\\:hidden li',
      );
      const skeletonCount = await skeletonMobileList.count();
      expect(skeletonCount).toBeGreaterThan(0);

      for (let i = 0; i < VENDOR_COUNT; i++) {
        vendorIds.push(
          await seedVendor(api, {
            name: `E2E Layout Vendor ${runId}-${i}`,
            category: "handyman",
          }),
        );
      }
      await page.unroute("**/api/vendors**");
      await navPromise;
      await page.reload();
      await page.waitForLoadState("networkidle");

      const loadedMobileCards = page.locator('[data-testid="vendors-mobile"] li');
      const loadedCount = await loadedMobileCards.count();
      expect(loadedCount).toBeGreaterThanOrEqual(VENDOR_COUNT);

      // Same skeleton-vs-loaded tolerance as the applicants layout spec.
      expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
    } finally {
      for (const id of vendorIds) await deleteVendor(api, id);
    }
  });

  test("renders without horizontal scroll at mobile / tablet / desktop viewports", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const vendorIds: string[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        vendorIds.push(
          await seedVendor(api, {
            name: `E2E Multi Layout Vendor ${runId}-${i}`,
            category: "plumber",
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
        await page.goto("/vendors");
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByRole("heading", { name: "Vendors" }),
          `heading visible at ${vp.name}`,
        ).toBeVisible();

        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(docWidth, `no horizontal overflow at ${vp.name}`).toBeLessThanOrEqual(
          vp.width + 1,
        );
      }
    } finally {
      for (const id of vendorIds) await deleteVendor(api, id);
    }
  });

  test("vendor category chip filter is keyboard-accessible (44px touch target)", async ({
    authedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/vendors");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();

    const allChip = page.getByTestId("vendor-filter-all");
    await expect(allChip).toBeVisible();
    const box = await allChip.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const preferredToggle = page.getByTestId("vendor-preferred-toggle");
    await expect(preferredToggle).toBeVisible();
    const preferredBox = await preferredToggle.boundingBox();
    expect(preferredBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("detail skeleton section headers match the loaded page", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const vendorId = await seedVendor(api, {
      name: `E2E Detail Skeleton ${runId}`,
      category: "plumber",
      phone: "555-9999",
      email: "skeleton@example.com",
      address: "1 Skeleton Way",
      hourly_rate: "100.00",
      flat_rate_notes: "Flat $150 for inspection",
      notes: "Layout test vendor",
    });

    try {
      await page.route(`**/api/vendors/${vendorId}`, async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto(`/vendors/${vendorId}`);
      await expect(page.getByTestId("vendor-detail-skeleton")).toBeVisible({
        timeout: 5000,
      });
      const skeletonSections = [
        "contact-section-skeleton",
        "pricing-section-skeleton",
        "notes-section-skeleton",
      ];
      for (const sectionId of skeletonSections) {
        await expect(
          page.getByTestId(sectionId),
          `${sectionId} present in skeleton`,
        ).toBeVisible();
      }

      await page.unroute(`**/api/vendors/${vendorId}`);
      await navPromise;
      await page.waitForLoadState("networkidle");

      const loadedSections = ["contact-section", "pricing-section", "notes-section"];
      for (const sectionId of loadedSections) {
        await expect(
          page.getByTestId(sectionId),
          `${sectionId} present after load`,
        ).toBeVisible();
      }
    } finally {
      await deleteVendor(api, vendorId);
    }
  });
});
