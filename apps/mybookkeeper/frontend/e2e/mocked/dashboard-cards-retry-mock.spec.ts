/**
 * No-backend E2E for Retry on the dashboard's comparison and renewal cards
 * (utility rate comparison, utility renewals, insurance premium comparison).
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Each card reads several queries and shows one "couldn't load" alert when any
 * of them fails. Retry used to refetch only the card's main query, so when a
 * different query was the one that failed, Retry did nothing and the card stayed
 * on its error for good. These specs fail a secondary query, let it recover, and
 * check that Retry brings the card back.
 *
 * The retry's response is held open so the in-flight state can be checked too.
 * RTK clears ``isError`` the moment a retry starts while the query still has no
 * data, which a card can misread as an empty result: "no market rate recorded",
 * an all-clear, or no plans at all, so the card would vanish. While the retry
 * runs, the card must keep its error up and show the retry in progress.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";

const COMPARISON_ERROR = "Couldn't compare your utility rates to the market.";
const RENEWAL_ERROR = "Couldn't check utility plan renewals.";
const INSURANCE_ERROR = "Couldn't compare your insurance premiums to the market.";

const PLAN_PAGE = { items: [{ id: "00000000-0000-0000-0000-0000000000a1" }], total: 1, has_more: false };
const CLEAR_RENEWALS = { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };
const CLEAR_COMPARISON = {
  material_gap_pct: 10,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  has_stale_benchmark: false,
};
const BENCHMARK = {
  id: "00000000-0000-0000-0000-0000000000b1",
  service_type: "electricity",
  rate_cents_per_kwh: "12.5000",
  monthly_cents: null,
  source: null,
  observed_on: "2026-10-01",
  notes: null,
  is_stale: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const EMPTY_SUMMARY = {
  revenue: 0,
  expenses: 0,
  profit: 0,
  by_category: {},
  by_property: [],
  by_month: [],
  by_month_expense: [],
  by_property_month: [],
};

const EMPTY_PROPERTY_PNL = {
  since: "2026-11-01",
  until: "2026-11-07",
  properties: [],
  total_revenue_cents: 0,
  total_expenses_cents: 0,
  total_net_cents: 0,
};
const EMPTY_PREMIUM_COMPARISON = {
  material_gap_pct: 10,
  benchmark: null,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  total_considered: 0,
  has_stale_benchmark: false,
};
const CLEAR_PREMIUM_COMPARISON = {
  ...EMPTY_PREMIUM_COMPARISON,
  benchmark: {
    id: "00000000-0000-0000-0000-0000000000c1",
    annual_premium_cents: 180000,
    coverage_amount_cents: 40000000,
    region_label: null,
    source: null,
    observed_on: "2026-10-01",
    notes: null,
    rate_cents_per_1000_coverage: "450.0000",
    is_stale: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  total_considered: 1,
};
const EMPTY_ATTRIBUTION_QUEUE = { items: [], total: 0, pending_count: 0 };

async function stubDashboard(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
  // The rest of the dashboard, answered with its real (empty) shapes so the page renders.
  await page.route(/\/api\/summary(\?|$)/, (route) => route.fulfill(json(EMPTY_SUMMARY)));
  await page.route(/\/api\/dashboard\/property-pnl(\?|$)/, (route) => route.fulfill(json(EMPTY_PROPERTY_PNL)));
  await page.route(/\/api\/insurance-policies\/premium-comparison(\?|$)/, (route) =>
    route.fulfill(json(EMPTY_PREMIUM_COMPARISON)),
  );
  await page.route(/\/api\/transactions\/attribution-review-queue(\?|$)/, (route) =>
    route.fulfill(json(EMPTY_ATTRIBUTION_QUEUE)),
  );
  await page.route(/\/api\/utility-plans(\?|$)/, (route) => route.fulfill(json(PLAN_PAGE)));
  await page.route(/\/api\/utility-plans\/rate-comparison(\?|$)/, (route) => route.fulfill(json(CLEAR_COMPARISON)));
  await page.route(/\/api\/utility-plans\/renewal-alerts(\?|$)/, (route) => route.fulfill(json(CLEAR_RENEWALS)));
  await page.route(/\/api\/market-rate-benchmarks(\?|$)/, (route) => route.fulfill(json([BENCHMARK])));
}

function retryButtonNextTo(page: Page, message: string, name: "Retry" | "Retrying...") {
  return page.getByText(message).locator("..").getByRole("button", { name, exact: true });
}

test("rate comparison card: Retry recovers when the market-rate query was the one that failed", async ({ page }) => {
  await plantAuth(page);
  await stubDashboard(page);
  const benchmarks = await failUntilRecovered(page, /\/api\/market-rate-benchmarks(\?|$)/, [BENCHMARK]);
  await page.goto("/");

  await expect(page.getByText(COMPARISON_ERROR)).toBeVisible();

  benchmarks.recover();
  const before = benchmarks.loads();
  await retryButtonNextTo(page, COMPARISON_ERROR, "Retry").click();

  // In flight: still the error, with the retry visibly running — not a prompt
  // to record a market rate the user may well have recorded.
  await expect(retryButtonNextTo(page, COMPARISON_ERROR, "Retrying...")).toBeDisabled();
  await expect(page.getByTestId("utility-plan-comparison-card-no-benchmark")).toHaveCount(0);
  await expect(page.getByTestId("utility-plan-comparison-card-clear")).toHaveCount(0);
  await expect.poll(benchmarks.loads).toBeGreaterThan(before);

  benchmarks.release();
  await expect(page.getByTestId("utility-plan-comparison-card-clear")).toBeVisible();
  await expect(page.getByText(COMPARISON_ERROR)).toHaveCount(0);
});

test("renewal card: Retry recovers when the plans query was the one that failed", async ({ page }) => {
  await plantAuth(page);
  await stubDashboard(page);
  const plans = await failUntilRecovered(page, /\/api\/utility-plans(\?|$)/, PLAN_PAGE);
  await page.goto("/");

  await expect(page.getByText(RENEWAL_ERROR)).toBeVisible();

  plans.recover();
  const before = plans.loads();
  await retryButtonNextTo(page, RENEWAL_ERROR, "Retry").click();

  // In flight: with no plans data yet, the card would otherwise hide itself.
  // Both cards share the plans query, so both show the retry running.
  await expect(retryButtonNextTo(page, RENEWAL_ERROR, "Retrying...")).toBeDisabled();
  await expect(retryButtonNextTo(page, COMPARISON_ERROR, "Retrying...")).toBeDisabled();
  await expect.poll(plans.loads).toBeGreaterThan(before);

  plans.release();
  await expect(page.getByTestId("utility-plan-alert-card-clear")).toBeVisible();
  await expect(page.getByTestId("utility-plan-comparison-card-clear")).toBeVisible();
  await expect(page.getByText(RENEWAL_ERROR)).toHaveCount(0);
  await expect(page.getByText(COMPARISON_ERROR)).toHaveCount(0);
});

test("insurance comparison card: holds the error through a retry instead of vanishing", async ({ page }) => {
  await plantAuth(page);
  await stubDashboard(page);
  const comparison = await failUntilRecovered(
    page,
    /\/api\/insurance-policies\/premium-comparison(\?|$)/,
    CLEAR_PREMIUM_COMPARISON,
  );
  await page.goto("/");

  await expect(page.getByText(INSURANCE_ERROR)).toBeVisible();

  comparison.recover();
  const before = comparison.loads();
  await retryButtonNextTo(page, INSURANCE_ERROR, "Retry").click();

  // In flight: with no data yet the card would otherwise read as "no policies
  // tracked" and hide itself.
  await expect(retryButtonNextTo(page, INSURANCE_ERROR, "Retrying...")).toBeDisabled();
  await expect.poll(comparison.loads).toBeGreaterThan(before);

  comparison.release();
  await expect(page.getByTestId("insurance-premium-comparison-card-clear")).toBeVisible();
  await expect(page.getByText(INSURANCE_ERROR)).toHaveCount(0);
});
