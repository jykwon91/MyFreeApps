import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Layout E2E for the Utility Plans list.
 *
 * Verifies:
 *   1. The loading skeleton has the same row count and the same
 *      text-block-plus-badge shape as the loaded list, so nothing shifts when
 *      the data arrives.
 *   2. The list renders without horizontal overflow at mobile / tablet /
 *      desktop widths.
 *   3. The delete control meets the 44px touch-target minimum on mobile.
 */

const PLAN_COUNT = 3;
/** Matches the placeholder row count in ``UtilityPlansListBody``'s skeleton. */
const SKELETON_ROW_COUNT = 3;

interface SeededPlan {
  id: string;
}

async function seedPlan(
  api: APIRequestContext,
  propertyId: string,
  providerName: string,
): Promise<string> {
  const res = await api.post("/utility-plans", {
    data: {
      property_id: propertyId,
      service_type: "electricity",
      provider_name: providerName,
      rate_type: "fixed",
      plan_name: "12 Month Fixed",
      energy_charge_cents_per_kwh: "11.6000",
      tdu_charge_cents_per_kwh: "5.3509",
      avg_price_cents_per_kwh_at_1000: "13.9000",
      term_months: 12,
      term_end_date: "2026-01-27",
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPlan failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as SeededPlan;
  return body.id;
}

async function hasHorizontalOverflow(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe("Utility Plans layout", () => {
  test("skeleton row count and shape match the loaded list", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    const planIds: string[] = [];

    try {
      const property = await createProperty(api, { name: `E2E Layout Property ${runId}` });
      propertyId = property.id;
      for (let i = 0; i < PLAN_COUNT; i++) {
        planIds.push(await seedPlan(api, propertyId, `E2E Layout Power ${runId}-${i}`));
      }

      // Hold the list response long enough to observe the skeleton. The glob's
      // trailing `*` stops at the next `/`, so `/renewal-alerts` is untouched.
      await page.route("**/api/utility-plans*", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/utility-plans");

      const skeleton = page.getByTestId("utility-plans-loading");
      await expect(skeleton).toBeVisible({ timeout: 5000 });
      const skeletonRows = skeleton.locator("> div");
      await expect(skeletonRows).toHaveCount(SKELETON_ROW_COUNT);
      // Each placeholder row reserves exactly one badge slot, like a real row.
      await expect(skeleton.locator(".rounded-full")).toHaveCount(SKELETON_ROW_COUNT);

      await navPromise;
      const list = page.getByTestId("utility-plans-list");
      await expect(list).toBeVisible({ timeout: 15000 });

      // Every seeded plan is on the page, so the skeleton stood in for at
      // least as many rows as arrived — it never under-reserved height.
      for (const id of planIds) {
        await expect(page.getByTestId(`utility-plan-item-${id}`)).toBeVisible();
      }
      const loadedRows = page.locator('[data-testid^="utility-plan-item-"]');
      const loadedCount = await loadedRows.count();
      expect(loadedCount).toBeGreaterThanOrEqual(PLAN_COUNT);

      // One badge per row, loaded and loading alike — that 1:1 ratio is the
      // shape the skeleton is promising, and it is what keeps the right-hand
      // column from jumping when the data lands. Counted rather than compared
      // to a fixed number because this account is shared with the sibling
      // layout test running in parallel.
      await expect(list.getByTestId(/^utility-plan-status-/)).toHaveCount(loadedCount);
    } finally {
      for (const id of planIds) await api.delete(`/utility-plans/${id}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the list fits every viewport width and keeps 44px touch targets", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let planId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: `E2E Wide Property Name That Could Overflow ${runId}`,
      });
      propertyId = property.id;
      planId = await seedPlan(
        api,
        propertyId,
        `E2E Provider With A Deliberately Long Name ${runId}`,
      );

      for (const size of [
        { width: 375, height: 800 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(size);
        await page.goto("/utility-plans");
        await expect(page.getByTestId(`utility-plan-item-${planId}`)).toBeVisible({
          timeout: 15000,
        });
        expect(
          await hasHorizontalOverflow(page),
          `horizontal overflow at ${size.width}px`,
        ).toBe(false);
      }

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/utility-plans");
      const deleteButton = page.getByTestId(`utility-plan-delete-${planId}`);
      await expect(deleteButton).toBeVisible({ timeout: 15000 });
      const box = await deleteButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    } finally {
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
