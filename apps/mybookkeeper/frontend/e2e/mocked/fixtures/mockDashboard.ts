/**
 * The dashboard's (/) reads, answered with their real shapes for an empty
 * workspace: no transactions, no properties, nothing to review or renew.
 *
 * The "empty" catch-all answers every GET with `[]`, which is right for list
 * endpoints but not for these: GET /summary is an object the dashboard reads
 * keys of, so `[]` crashed the page into its error boundary while the sidebar
 * still rendered. stubWorkspaceShell registers these, so every spec that lands
 * on / gets them; a spec that wants a different answer registers its own route
 * afterwards, which Playwright tries first.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import type { PropertyPnLResponse } from "@mybookkeeper/api-client/types/attribution/property-pnl-response";
import type { InsurancePremiumComparison } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import type { UtilityPlanListResponse } from "@mybookkeeper/api-client/types/utility/utility-plan-list-response";
import type { UtilityPlanRateComparison } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-alert";
import type { DashboardRead } from "../types/dashboard-read";

/** GET /summary (SummaryResponse) with no transactions in range. */
export const EMPTY_SUMMARY: SummaryResponse = {
  revenue: 0,
  expenses: 0,
  profit: 0,
  by_category: {},
  by_property: [],
  by_month: [],
  by_month_expense: [],
  by_month_revenue: [],
  by_property_month: [],
};

/** GET /summary/years: the years that have transactions, none yet. */
export const NO_SUMMARY_YEARS: number[] = [];

/** GET /dashboard/property-pnl with no properties. */
export const EMPTY_PROPERTY_PNL: PropertyPnLResponse = {
  since: "2026-11-01",
  until: "2026-11-07",
  properties: [],
  total_revenue_cents: 0,
  total_expenses_cents: 0,
  total_net_cents: 0,
};

/** GET /transactions/attribution-review-queue with nothing to review. */
export const EMPTY_ATTRIBUTION_QUEUE: AttributionReviewQueueResponse = { items: [], total: 0, pending_count: 0 };

/** GET /insurance-policies/premium-comparison with no policies and no benchmark. */
export const EMPTY_PREMIUM_COMPARISON: InsurancePremiumComparison = {
  material_gap_pct: 10,
  benchmark: null,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  total_considered: 0,
  has_stale_benchmark: false,
};

/** GET /utility-plans with no plans. */
export const EMPTY_UTILITY_PLANS: UtilityPlanListResponse = { items: [], total: 0, has_more: false };

/** GET /utility-plans/rate-comparison with nothing above the market. */
export const CLEAR_RATE_COMPARISON: UtilityPlanRateComparison = {
  material_gap_pct: 10,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  has_stale_benchmark: false,
};

/** GET /utility-plans/renewal-alerts with nothing expiring. */
export const CLEAR_RENEWALS: UtilityPlanRenewalAlert = {
  window_days: 45,
  expired: [],
  expiring_soon: [],
  total_needing_attention: 0,
};

/** One dashboard read: the path under /api (any query string) and its answer. */
async function answer(page: Page, path: string, body: DashboardRead): Promise<void> {
  await page.route(new RegExp(`/api${path}(\\?|$)`), (route) =>
    route.request().method() === "GET" ? route.fulfill(json(body)) : route.fallback(),
  );
}

/** Answers every read the dashboard makes beyond the shell's, for an empty workspace. */
export async function stubDashboardReads(page: Page): Promise<void> {
  await answer(page, "/summary", EMPTY_SUMMARY);
  await answer(page, "/summary/years", NO_SUMMARY_YEARS);
  await answer(page, "/dashboard/property-pnl", EMPTY_PROPERTY_PNL);
  await answer(page, "/transactions/attribution-review-queue", EMPTY_ATTRIBUTION_QUEUE);
  await answer(page, "/insurance-policies/premium-comparison", EMPTY_PREMIUM_COMPARISON);
  await answer(page, "/utility-plans", EMPTY_UTILITY_PLANS);
  await answer(page, "/utility-plans/rate-comparison", CLEAR_RATE_COMPARISON);
  await answer(page, "/utility-plans/renewal-alerts", CLEAR_RENEWALS);
}
