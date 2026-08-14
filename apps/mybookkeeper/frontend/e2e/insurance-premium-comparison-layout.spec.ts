import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Layout E2E for the dashboard premium-comparison card and the market-premium
 * dialog.
 *
 * Verifies:
 *   1. The card's loading skeleton has the same row count and the same
 *      text-block-plus-pill shape as the loaded card, so the dashboard does not
 *      shift when the comparison arrives.
 *   2. Neither the dashboard, the policies page, nor the dialog overflows
 *      horizontally at mobile / tablet / desktop widths.
 *   3. The dialog's close control meets the 44px touch-target minimum.
 *
 * The benchmark is a singleton per organization and this account is shared with
 * the sibling insurance specs, so this file runs serially and removes the
 * benchmark on the way out — two tests upserting the same row concurrently
 * would race on the unique index.
 */

/** Matches the placeholder row count in ``InsurancePremiumComparisonCardSkeleton``. */
const SKELETON_ROW_COUNT = 2;

const BENCHMARK_URL = "/insurance-benchmarks";

function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** An unambiguously above-market policy: 600¢ per $1,000 against a 300¢ market. */
async function seedPolicy(
  api: APIRequestContext,
  propertyId: string,
  policyName: string,
): Promise<string> {
  const res = await api.post("/insurance-policies", {
    data: {
      property_id: propertyId,
      policy_name: policyName,
      carrier: "E2E Mutual",
      premium_cents: 240_000,
      premium_frequency: "annual",
      coverage_amount_cents: 40_000_000,
      effective_date: isoDateOffset(-30),
      expiration_date: isoDateOffset(335),
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPolicy failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function seedBenchmark(api: APIRequestContext, source: string): Promise<void> {
  const res = await api.put(BENCHMARK_URL, {
    data: {
      annual_premium_cents: 120_000,
      coverage_amount_cents: 40_000_000,
      region_label: "Harris County, TX",
      source,
      observed_on: isoDateOffset(0),
    },
  });
  expect(res.ok()).toBe(true);
}

async function hasHorizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Insurance premium comparison layout", () => {
  test("skeleton row count and shape match the loaded card", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let policyId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Premium Layout ${runId}`,
      });
      propertyId = property.id;
      policyId = await seedPolicy(api, propertyId, `E2E Premium Layout Policy ${runId}`);
      await seedBenchmark(api, `E2E premium layout ${runId}`);
      benchmarkRecorded = true;

      // Hold the comparison response long enough to observe the skeleton. The
      // glob is exact so the sibling `/insurance-policies` list call is
      // untouched.
      await page.route("**/api/insurance-policies/premium-comparison", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/");

      const skeleton = page.getByTestId("insurance-premium-comparison-card-loading");
      await expect(skeleton).toBeVisible({ timeout: 15000 });
      await expect(skeleton.locator("ul > li")).toHaveCount(SKELETON_ROW_COUNT);
      // Each placeholder row reserves exactly one gap-pill slot, like a real row.
      await expect(skeleton.locator(".rounded-full")).toHaveCount(SKELETON_ROW_COUNT);

      await navPromise;

      await expect(page.getByTestId("insurance-premium-comparison-card")).toBeVisible({
        timeout: 20000,
      });
      await expect(
        page.getByTestId(`insurance-premium-comparison-${policyId}`),
      ).toBeVisible();
      // One gap pill per row, loaded and loading alike — that 1:1 ratio is the
      // shape the skeleton promises, and it keeps the right-hand column from
      // jumping when the data lands. Counted rather than compared to a fixed
      // number because the account is shared with the sibling insurance specs.
      // Scoped to the above-market list specifically: the card also renders a
      // "not checked" list, whose rows carry no gap pill by design.
      const loadedRows = page.locator(
        '[data-testid="insurance-premium-comparison-above-list"] > li',
      );
      const loadedCount = await loadedRows.count();
      expect(loadedCount).toBeGreaterThanOrEqual(1);
      await expect(
        page.locator('[data-testid^="insurance-premium-comparison-gap-"]'),
      ).toHaveCount(loadedCount);
    } finally {
      if (benchmarkRecorded) await api.delete(BENCHMARK_URL).catch(() => {});
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the card and dialog fit every viewport and keep 44px touch targets", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let policyId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Wide Premium Property Name That Could Overflow ${runId}`,
      });
      propertyId = property.id;
      policyId = await seedPolicy(
        api,
        propertyId,
        `E2E Premium Policy With A Deliberately Long Name ${runId}`,
      );
      await seedBenchmark(
        api,
        `E2E a deliberately long provenance string for overflow ${runId}`,
      );
      benchmarkRecorded = true;

      for (const size of [
        { width: 375, height: 800 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(size);
        await page.goto("/");
        await expect(
          page.getByTestId(`insurance-premium-comparison-${policyId}`),
        ).toBeVisible({ timeout: 20000 });
        expect(
          await hasHorizontalOverflow(page),
          `dashboard overflow at ${size.width}px`,
        ).toBe(false);

        await page.goto("/insurance-policies");
        await expect(page.getByTestId("insurance-benchmark-summary")).toBeVisible({
          timeout: 15000,
        });
        expect(
          await hasHorizontalOverflow(page),
          `policies page overflow at ${size.width}px`,
        ).toBe(false);
      }

      // The dialog is the tightest layout — a modal on a 375px viewport, and
      // the only place two currency fields sit side by side.
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/insurance-policies");
      await page.getByTestId("insurance-benchmark-summary-edit").click();
      await expect(page.getByTestId("insurance-benchmark-dialog")).toBeVisible();
      expect(await hasHorizontalOverflow(page), "dialog overflow at 375px").toBe(false);

      // Both figures must stay tappable, not just visible.
      for (const field of [
        "insurance-benchmark-premium",
        "insurance-benchmark-coverage",
      ]) {
        const box = await page.getByTestId(field).boundingBox();
        expect(box, `${field} has no box`).not.toBeNull();
        expect(box!.height, `${field} height`).toBeGreaterThanOrEqual(44);
      }

      const close = page
        .getByTestId("insurance-benchmark-dialog")
        .getByRole("button", { name: "Close" });
      const box = await close.boundingBox();
      expect(box, "close control has no box").not.toBeNull();
      expect(box!.width, "close width").toBeGreaterThanOrEqual(44);
      expect(box!.height, "close height").toBeGreaterThanOrEqual(44);
    } finally {
      if (benchmarkRecorded) await api.delete(BENCHMARK_URL).catch(() => {});
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
