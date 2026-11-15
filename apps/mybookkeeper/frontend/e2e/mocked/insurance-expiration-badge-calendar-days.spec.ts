/**
 * No-backend E2E for the insurance list's expiry badge late in the day.
 *
 * The badge used to count whole 24-hour spans from now, so any time after
 * midnight lost a day: at 8pm on Nov 14 a policy ending Nov 16 read "in 1 day"
 * while the phone said 2. It now counts calendar days from the local date.
 *
 * Verifies, with the browser clock set to 8pm local on Nov 14:
 *   - A policy ending Nov 16 shows "Expires in 2 days".
 *   - A policy ending Nov 15 shows "Expires tomorrow".
 *   - A policy ending Dec 14 (30 calendar days) is still the amber badge.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c2";

function policy(id: string, name: string, expirationDate: string): InsurancePolicySummary {
  return {
    id,
    property_id: PROPERTY_ID,
    property_name: "E2E Peerless",
    policy_name: name,
    carrier: null,
    effective_date: null,
    expiration_date: expirationDate,
    coverage_amount_cents: null,
    premium_cents: null,
    premium_frequency: null,
    fees_and_taxes_cents: null,
    deductible_cents: null,
    wind_hail_deductible_pct: null,
    annual_premium_cents: null,
    annual_total_cents: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const POLICIES = [
  policy("00000000-0000-0000-0000-0000000000a1", "Ends in two days", "2026-11-16"),
  policy("00000000-0000-0000-0000-0000000000a2", "Ends tomorrow", "2026-11-15"),
  policy("00000000-0000-0000-0000-0000000000a3", "Ends in thirty days", "2026-12-14"),
];

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 14, 20, 0) });
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
  await page.route("**/api/properties", (route) => route.fulfill(json([{ id: PROPERTY_ID, name: "E2E Peerless" }])));
  await page.route("**/api/insurance-benchmarks?*", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/api/insurance-policies?*", (route) =>
    route.fulfill(json({ items: POLICIES, total: POLICIES.length, has_more: false })),
  );
  await page.route("**/api/insurance-policies", (route) =>
    route.fulfill(json({ items: POLICIES, total: POLICIES.length, has_more: false })),
  );
});

test.describe("Insurance list — expiry badge counts calendar days", () => {
  test("at 8pm the badges still count whole calendar days", async ({ page }) => {
    await page.goto("/insurance-policies");

    const rows = page.getByRole("listitem");
    await expect(rows.filter({ hasText: "Ends in two days" }).getByText("Expires in 2 days")).toBeVisible({ timeout: 15000 });
    await expect(rows.filter({ hasText: "Ends tomorrow" }).getByText("Expires tomorrow")).toBeVisible();
    await expect(rows.filter({ hasText: "Ends in thirty days" }).getByTestId("expiration-badge-soon")).toBeVisible();
  });
});
