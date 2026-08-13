import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Layout E2E for the insurance policy detail page.
 *
 * Verifies:
 *   1. The loading skeleton reserves the same section count and the same
 *      two-column field grid as the loaded page, so adding the Cost section
 *      did not leave the skeleton one block short and the page shifting.
 *   2. The page renders without horizontal overflow at mobile / tablet /
 *      desktop widths, including the widest cost string the page can produce.
 *   3. Edit and Delete both meet the 44px touch-target minimum on mobile.
 */

/** Bordered sections on the loaded page: policy details, cost, documents. */
const SECTION_COUNT = 3;

interface SeededPolicy {
  id: string;
}

async function createListing(
  api: APIRequestContext,
  propertyId: string,
  title: string,
): Promise<string> {
  const res = await api.post("/listings", {
    data: {
      property_id: propertyId,
      title,
      monthly_rate: "1500.00",
      room_type: "private_room",
      status: "active",
      private_bath: false,
      parking_assigned: false,
      furnished: false,
      pets_on_premises: false,
    },
  });
  if (!res.ok()) {
    throw new Error(`createListing failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as SeededPolicy).id;
}

async function seedPolicy(
  api: APIRequestContext,
  listingId: string,
  policyName: string,
): Promise<string> {
  const res = await api.post("/insurance-policies", {
    data: {
      listing_id: listingId,
      policy_name: policyName,
      carrier: "E2E Mutual",
      policy_number: "POL-E2E-LAYOUT",
      effective_date: "2025-01-01",
      expiration_date: "2026-01-01",
      coverage_amount_cents: 50000000,
      premium_cents: 11200,
      premium_frequency: "monthly",
      deductible_cents: 250000,
      wind_hail_deductible_pct: "2.00",
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPolicy failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as SeededPolicy).id;
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe("Insurance policy detail layout", () => {
  test("skeleton section count and field grid match the loaded page", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let listingId: string | null = null;
    let policyId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: `E2E Insurance Layout Property ${runId}`,
      });
      propertyId = property.id;
      listingId = await createListing(
        api,
        propertyId,
        `E2E Insurance Layout Listing ${runId}`,
      );
      policyId = await seedPolicy(api, listingId, `E2E Layout Policy ${runId}`);

      // Hold the single-policy fetch long enough to observe the skeleton.
      await page.route(`**/api/insurance-policies/${policyId}`, async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto(`/insurance-policies/${policyId}`);

      const skeleton = page.getByTestId("insurance-policy-detail-skeleton");
      await expect(skeleton).toBeVisible({ timeout: 5000 });
      // Header block plus one placeholder per bordered section.
      await expect(skeleton.locator("> div")).toHaveCount(SECTION_COUNT + 1);
      // Details and cost each reserve a two-column field grid; documents does
      // not — that 2-of-3 split is the shape the loaded page has.
      await expect(skeleton.locator(".grid-cols-2")).toHaveCount(2);
      // Placeholder blocks in order: header, policy details, cost, documents.
      const skeletonCostHeight = (await skeleton
        .locator("> div")
        .nth(2)
        .boundingBox())!.height;

      await navPromise;
      const cost = page.getByTestId("insurance-policy-cost");
      await expect(cost).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("insurance-policy-details")).toBeVisible();

      // The cost placeholder reserved what the real cost section takes, so
      // adding that section did not leave the skeleton a block short and the
      // page below it jumping. The threshold is generous — the promise is "no
      // visible jolt", not pixel equality.
      const loadedCostHeight = (await cost.boundingBox())!.height;
      expect(Math.abs(loadedCostHeight - skeletonCostHeight)).toBeLessThan(60);
      expect(await hasHorizontalOverflow(page), "overflow when loaded").toBe(false);
    } finally {
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (listingId) await api.delete(`/listings/${listingId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the page fits every viewport width and keeps 44px touch targets", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let listingId: string | null = null;
    let policyId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: `E2E Insurance Wide Property ${runId}`,
      });
      propertyId = property.id;
      listingId = await createListing(
        api,
        propertyId,
        `E2E Insurance Wide Listing ${runId}`,
      );
      policyId = await seedPolicy(
        api,
        listingId,
        `E2E Policy With A Deliberately Long Name That Could Overflow ${runId}`,
      );

      for (const size of [
        { width: 375, height: 800 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(size);
        await page.goto(`/insurance-policies/${policyId}`);
        await expect(page.getByTestId("insurance-policy-cost")).toBeVisible({
          timeout: 15000,
        });
        // The longest string the cost section can produce — a percentage and a
        // priced-out dollar figure on one line.
        await expect(page.getByTestId("insurance-wind-hail-deductible")).toHaveText(
          "2% of coverage ($10,000.00)",
        );
        expect(
          await hasHorizontalOverflow(page),
          `horizontal overflow at ${size.width}px`,
        ).toBe(false);
      }

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`/insurance-policies/${policyId}`);
      await expect(page.getByTestId("insurance-policy-cost")).toBeVisible({
        timeout: 15000,
      });
      for (const testId of [
        "edit-insurance-policy-button",
        "delete-insurance-policy-button",
      ]) {
        const control = page.getByTestId(testId);
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box, `${testId} has no box`).not.toBeNull();
        expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (listingId) await api.delete(`/listings/${listingId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
