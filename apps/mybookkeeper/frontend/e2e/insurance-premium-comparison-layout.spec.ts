import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createProperty } from "./fixtures/seed-data";
import { seededOrg } from "./fixtures/seeded-org";
import { localDateOffset, localToday } from "./fixtures/local-today";

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
 * The benchmark is a singleton per organization, so the file has an
 * organization of its own and runs its tests in order: two tests upserting the
 * same row concurrently would race on the unique index. Deleting the
 * organization afterwards removes everything they seeded.
 */

/** Matches the placeholder row count in ``InsurancePremiumComparisonCardSkeleton``. */
const SKELETON_ROW_COUNT = 2;

const BENCHMARK_URL = "/insurance-benchmarks";

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
      effective_date: localDateOffset(-30),
      expiration_date: localDateOffset(335),
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
      today: localToday(),
      annual_premium_cents: 120_000,
      coverage_amount_cents: 40_000_000,
      region_label: "Harris County, TX",
      source,
      observed_on: localDateOffset(0),
    },
  });
  expect(res.ok()).toBe(true);
}

async function hasHorizontalOverflow(
  page: Page,
): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Insurance premium comparison layout", () => {
  const org = seededOrg("insurance-premium-layout");

  test("skeleton row count and shape match the loaded card", async ({ page }) => {
    const { api } = org();
    await org().signIn(page);
    const runId = Date.now();

    const property = await createProperty(api, {
      name: `E2E Premium Layout ${runId}`,
    });
    const propertyId = property.id;
    const policyId = await seedPolicy(api, propertyId, `E2E Premium Layout Policy ${runId}`);
    await seedBenchmark(api, `E2E premium layout ${runId}`);

    // Hold the comparison response long enough to observe the skeleton. The
    // glob is exact so the sibling `/insurance-policies` list call is
    // untouched.
    await page.route("**/api/insurance-policies/premium-comparison?*", async (route) => {
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
    // jumping when the data lands. Scoped to the above-market list
    // specifically: the card also renders a "not checked" list, whose rows
    // carry no gap pill by design.
    await expect(
      page.locator('[data-testid="insurance-premium-comparison-above-list"] > li'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid^="insurance-premium-comparison-gap-"]'),
    ).toHaveCount(1);
  });

  test("the card and dialog fit every viewport and keep 44px touch targets", async ({ page }) => {
    const { api } = org();
    await org().signIn(page);
    const runId = Date.now();

    const property = await createProperty(api, {
      name: `E2E Wide Premium Property Name That Could Overflow ${runId}`,
    });
    const propertyId = property.id;
    const policyId = await seedPolicy(
      api,
      propertyId,
      `E2E Premium Policy With A Deliberately Long Name ${runId}`,
    );
    await seedBenchmark(
      api,
      `E2E a deliberately long provenance string for overflow ${runId}`,
    );

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
  });
});
