import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Layout E2E for the dashboard rate-comparison card and the market-rate dialog.
 *
 * Verifies:
 *   1. The card's loading skeleton has the same row count and the same
 *      text-block-plus-pill shape as the loaded card, so the dashboard does not
 *      shift when the comparison arrives.
 *   2. Neither the dashboard nor the dialog overflows horizontally at mobile /
 *      tablet / desktop widths.
 *   3. The dialog's close control meets the 44px touch-target minimum.
 */

/** Matches the placeholder row count in ``UtilityPlanComparisonCardSkeleton``. */
const SKELETON_ROW_COUNT = 2;

/**
 * Benchmarks are keyed on (organization, service type) and this account is
 * shared with every other utility spec, so this file works in ``internet`` —
 * a service no sibling spec writes — and runs serially, because two tests
 * upserting the same row concurrently would race on the unique index.
 */
const SERVICE_TYPE = "internet";
const BENCHMARK_URL = `/market-rate-benchmarks/${SERVICE_TYPE}`;

function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seedPlan(
  api: APIRequestContext,
  propertyId: string,
  providerName: string,
): Promise<string> {
  const res = await api.post("/utility-plans", {
    data: {
      property_id: propertyId,
      service_type: SERVICE_TYPE,
      provider_name: providerName,
      rate_type: "fixed",
      // Flat service is priced per month, and the comparison adds the
      // equipment fee — $90 against a $60 market is comfortably flagged.
      monthly_base_charge_cents: 8000,
      equipment_fee_monthly_cents: 1000,
      service_start_date: isoDateOffset(-60),
      term_end_date: isoDateOffset(300),
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPlan failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).id;
}

async function hasHorizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Utility plan comparison layout", () => {
  test("skeleton row count and shape match the loaded card", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let planId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Comparison Layout ${runId}`,
      });
      propertyId = property.id;
      planId = await seedPlan(api, propertyId, `E2E Comparison Power ${runId}`);

      const benchRes = await api.put(BENCHMARK_URL, {
        data: {
          monthly_cents: 6000,
          source: `E2E comparison layout ${runId}`,
          observed_on: isoDateOffset(0),
        },
      });
      expect(benchRes.ok()).toBe(true);
      benchmarkRecorded = true;

      // Hold the comparison response long enough to observe the skeleton. The
      // glob is exact so the sibling `/utility-plans` list call is untouched.
      await page.route("**/api/utility-plans/rate-comparison", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/");

      const skeleton = page.getByTestId("utility-plan-comparison-card-loading");
      await expect(skeleton).toBeVisible({ timeout: 15000 });
      await expect(skeleton.locator("ul > li")).toHaveCount(SKELETON_ROW_COUNT);
      // Each placeholder row reserves exactly one gap-pill slot, like a real row.
      await expect(skeleton.locator(".rounded-full")).toHaveCount(SKELETON_ROW_COUNT);

      await navPromise;

      const card = page.getByTestId("utility-plan-comparison-card");
      await expect(card).toBeVisible({ timeout: 20000 });
      const row = page.getByTestId(`utility-plan-comparison-${planId}`);
      await expect(row).toBeVisible();
      // One gap pill per row, loaded and loading alike — that 1:1 ratio is the
      // shape the skeleton promises, and it keeps the right-hand column from
      // jumping when the data lands. Counted rather than compared to a fixed
      // number because the account is shared with the sibling utility specs.
      // Scoped to the above-market list specifically: the card also renders a
      // "not checked" list, whose rows carry no gap pill by design.
      const loadedRows = page.locator(
        '[data-testid="utility-plan-comparison-above-list"] > li',
      );
      const loadedCount = await loadedRows.count();
      expect(loadedCount).toBeGreaterThanOrEqual(1);
      await expect(
        page.locator('[data-testid^="utility-plan-comparison-gap-"]'),
      ).toHaveCount(loadedCount);
    } finally {
      if (benchmarkRecorded) {
        await api.delete(BENCHMARK_URL).catch(() => {});
      }
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the card and dialog fit every viewport and keep 44px touch targets", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let planId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Wide Comparison Property Name That Could Overflow ${runId}`,
      });
      propertyId = property.id;
      planId = await seedPlan(
        api,
        propertyId,
        `E2E Comparison Provider With A Deliberately Long Name ${runId}`,
      );

      const benchRes = await api.put(BENCHMARK_URL, {
        data: {
          monthly_cents: 6000,
          source: `E2E a deliberately long provenance string for overflow ${runId}`,
          observed_on: isoDateOffset(0),
        },
      });
      expect(benchRes.ok()).toBe(true);
      benchmarkRecorded = true;

      for (const size of [
        { width: 375, height: 800 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(size);
        await page.goto("/");
        await expect(page.getByTestId(`utility-plan-comparison-${planId}`)).toBeVisible({
          timeout: 20000,
        });
        expect(
          await hasHorizontalOverflow(page),
          `dashboard overflow at ${size.width}px`,
        ).toBe(false);

        await page.goto("/utility-plans");
        await expect(page.getByTestId(`market-rate-${SERVICE_TYPE}`)).toBeVisible({
          timeout: 15000,
        });
        expect(
          await hasHorizontalOverflow(page),
          `plans page overflow at ${size.width}px`,
        ).toBe(false);
      }

      // The dialog is the tightest layout — a modal on a 375px viewport.
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/utility-plans");
      await page.getByTestId("record-market-rate-button").click();
      await expect(page.getByTestId("market-rate-benchmark-dialog")).toBeVisible();
      expect(await hasHorizontalOverflow(page), "dialog overflow at 375px").toBe(false);

      const close = page
        .getByTestId("market-rate-benchmark-dialog")
        .getByRole("button", { name: "Close" });
      const box = await close.boundingBox();
      expect(box, "close control has no box").not.toBeNull();
      expect(box!.width, "close width").toBeGreaterThanOrEqual(44);
      expect(box!.height, "close height").toBeGreaterThanOrEqual(44);
    } finally {
      if (benchmarkRecorded) {
        await api.delete(BENCHMARK_URL).catch(() => {});
      }
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
