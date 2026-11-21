/**
 * No-backend E2E for driving the /analytics tabs by keyboard.
 *
 * Fully mocks the API via page.route(), so it runs under
 * playwright.layout.config.ts in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - Only the open tab is in the tab order, and the panel is labelled by it.
 *   - Arrow keys, End and Home move both focus and the open tab, and the URL follows.
 *   - The panel's content switches with the tab.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const RENTAL_ROI = {
  window_start: "2025-11-01",
  window_end: "2026-10-31",
  target_return_pct: "8",
  has_transactions: false,
  unassigned_revenue_monthly_cents: 0,
  summary: {
    property_count: 0,
    properties_with_target: 0,
    total_break_even_monthly_cents: 0,
    total_target_monthly_cents: 0,
    total_actual_revenue_monthly_cents: 0,
    total_gap_monthly_cents: 0,
    gap_basis: "break_even",
  },
  properties: [],
};

const UTILITY_TRENDS = { trends: [], summary: {}, total_spend: 0 };

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.route(/\/api\/analytics\/rental-roi(\?|$)/, (route) => route.fulfill(json(RENTAL_ROI)));
  await page.route(/\/api\/analytics\/utility-trends(\?|$)/, (route) => route.fulfill(json(UTILITY_TRENDS)));
});

test.describe("analytics tabs by keyboard", () => {
  test("arrow keys switch the open tab and its panel", async ({ page }) => {
    await plantAuth(page);
    await stubWorkspaceShell(page, "owner");
    await page.goto("/analytics");

    const roi = page.getByRole("tab", { name: "Rental ROI" });
    const utility = page.getByRole("tab", { name: "Utility Trends" });
    await expect(roi).toHaveAttribute("aria-selected", "true");
    await expect(roi).toHaveAttribute("tabindex", "0");
    await expect(utility).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("tabpanel", { name: "Rental ROI" })).toBeVisible();

    await roi.focus();
    await page.keyboard.press("ArrowRight");
    await expect(utility).toBeFocused();
    await expect(utility).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=utility-trends/);
    await expect(page.getByRole("tabpanel", { name: "Utility Trends" })).toBeVisible();

    await page.keyboard.press("Home");
    await expect(roi).toBeFocused();
    await expect(roi).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("End");
    await expect(utility).toBeFocused();
    await expect(utility).toHaveAttribute("aria-selected", "true");
  });
});
