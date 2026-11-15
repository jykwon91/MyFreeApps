/**
 * No-backend E2E for the market-rate and market-premium forms.
 *
 * The backend refuses a rate past 999.9999, a premium past $10,000,000, text past its column
 * limits and a future date. The forms must catch each of those themselves, point at the field,
 * and never send the request, rather than let the server answer with a validation list the
 * operator only ever sees as "Couldn't save".
 *
 * Fully mocked via page.route() so it runs under playwright.layout.config.ts.
 *
 * Verifies:
 *   - An over-limit rate / premium shows a message under its own field and sends nothing.
 *   - A valid figure afterwards saves, and the request carries what was typed.
 *   - The text fields stop at the backend's lengths.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) => route.fulfill(json([])));
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
});

/** Records every PUT to ``urlGlob`` and answers it with ``body``. */
async function captureSaves(page: Page, urlGlob: string, body: object): Promise<unknown[]> {
  const saves: unknown[] = [];
  await page.route(urlGlob, (route) => {
    if (route.request().method() !== "PUT") return route.fulfill(json(null));
    saves.push(route.request().postDataJSON());
    return route.fulfill(json(body));
  });
  return saves;
}

test.describe("Market rate form", () => {
  test("catches an over-limit rate itself, then saves a valid one", async ({ page }) => {
    await page.route("**/api/utility-plans*", (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
    await page.route("**/api/market-rate-benchmarks?*", (route) => route.fulfill(json([])));
    const saves = await captureSaves(page, "**/api/market-rate-benchmarks/electricity", {
      id: "b1",
      service_type: "electricity",
      rate_cents_per_kwh: "10.8000",
      monthly_cents: null,
      source: null,
      observed_on: "2026-01-01",
      notes: null,
      is_stale: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    await page.goto("/utility-plans");
    await page.getByTestId("record-market-rate-button").click();
    await expect(page.getByTestId("market-rate-benchmark-dialog")).toBeVisible();

    await expect(page.getByTestId("benchmark-source")).toHaveAttribute("maxlength", "255");
    await expect(page.getByTestId("benchmark-notes")).toHaveAttribute("maxlength", "5000");

    await page.getByTestId("benchmark-figure").fill("1000");
    await page.getByTestId("utility-plan-save-button").click();
    await expect(page.getByTestId("benchmark-figure-problem")).toContainText("999.9999");
    expect(saves).toHaveLength(0);

    await page.getByTestId("benchmark-figure").fill("11.12345");
    await page.getByTestId("utility-plan-save-button").click();
    await expect(page.getByTestId("benchmark-figure-problem")).toContainText("4 decimal places");
    expect(saves).toHaveLength(0);

    await page.getByTestId("benchmark-figure").fill("10.8");
    await page.getByTestId("utility-plan-save-button").click();
    await expect(page.getByTestId("market-rate-benchmark-dialog")).toBeHidden();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ rate_cents_per_kwh: "10.8" });
  });
});

test.describe("Market premium form", () => {
  test("catches an over-limit premium itself, then saves a valid one", async ({ page }) => {
    await page.route("**/api/insurance-policies/premium-comparison*", (route) =>
      route.fulfill(
        json({
          material_gap_pct: 15,
          benchmark: null,
          above_market: [],
          not_compared: [],
          total_above_market: 0,
          total_considered: 0,
          has_stale_benchmark: false,
        }),
      ),
    );
    await page.route("**/api/insurance-policies?*", (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
    await page.route("**/api/insurance-policies", (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
    const saves = await captureSaves(page, "**/api/insurance-benchmarks*", {
      id: "b1",
      annual_premium_cents: 120_000,
      coverage_amount_cents: 40_000_000,
      region_label: null,
      source: null,
      observed_on: "2026-01-01",
      notes: null,
      rate_cents_per_1000_coverage: "300.00",
      is_stale: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    await page.goto("/insurance-policies");
    await page.getByTestId("insurance-benchmark-summary-record").click();
    await expect(page.getByTestId("insurance-benchmark-dialog")).toBeVisible();

    await expect(page.getByTestId("insurance-benchmark-region")).toHaveAttribute("maxlength", "120");
    await expect(page.getByTestId("insurance-benchmark-source")).toHaveAttribute("maxlength", "255");
    await expect(page.getByTestId("insurance-benchmark-notes")).toHaveAttribute("maxlength", "5000");

    await page.getByTestId("insurance-benchmark-premium").fill("10000001");
    await page.getByTestId("insurance-benchmark-coverage").fill("1000000001");
    await page.getByTestId("insurance-benchmark-save-button").click();
    await expect(page.getByTestId("insurance-benchmark-premium-problem")).toContainText("looks like a typo");
    await expect(page.getByTestId("insurance-benchmark-coverage-problem")).toContainText("looks like a typo");
    expect(saves).toHaveLength(0);

    await page.getByTestId("insurance-benchmark-premium").fill("1200");
    await page.getByTestId("insurance-benchmark-coverage").fill("400000");
    await page.getByTestId("insurance-benchmark-save-button").click();
    await expect(page.getByTestId("insurance-benchmark-dialog")).toBeHidden();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ annual_premium_cents: 120_000, coverage_amount_cents: 40_000_000 });
  });
});
