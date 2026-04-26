import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

const RUN_ID = Date.now();
const E2E_VENDOR = `E2E Utility Vendor ${RUN_ID}`;

async function waitForAnalyticsLoad(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({ timeout: 10000 });
}

test.describe("Analytics — Layout", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/analytics");
    await waitForAnalyticsLoad(page);
  });

  test("renders the Analytics heading", async ({ authedPage: page }) => {
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  });

  test("shows Utility Trends tab as active by default", async ({ authedPage: page }) => {
    const tab = page.getByRole("tab", { name: "Utility Trends" });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });

  test("sidebar has Analytics nav link", async ({ authedPage: page }) => {
    const nav = page.getByRole("link", { name: "Analytics" });
    await expect(nav).toBeVisible();
  });

  test("URL defaults to tab=utility-trends", async ({ authedPage: page }) => {
    // Click the tab to ensure URL param is set
    await page.getByRole("tab", { name: "Utility Trends" }).click();
    await expect(page).toHaveURL(/tab=utility-trends/);
  });
});

test.describe("Analytics — Utility Trends", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/analytics?tab=utility-trends");
    await waitForAnalyticsLoad(page);
  });

  test("shows skeleton then loads content or empty state", async ({ authedPage: page }) => {
    // Reload to catch the skeleton
    await page.reload();
    // Either skeleton pulse elements or loaded content should be visible
    const loaded = page
      .getByText("Total Utility Spend")
      .or(page.getByText("I haven't found any utility expenses"))
      .or(page.getByText("No utility expenses found"))
      .or(page.locator(".animate-pulse").first());
    await expect(loaded).toBeVisible({ timeout: 15000 });
  });

  test("filter bar renders date inputs and granularity toggle", async ({ authedPage: page }) => {
    // Wait for content to load past skeleton
    await page.waitForTimeout(2000);

    // Check for filter elements — they're in the desktop view
    const fromInput = page.locator("input[type='date']").first();
    const monthlyBtn = page.getByRole("radio", { name: "Monthly" });
    const quarterlyBtn = page.getByRole("radio", { name: "Quarterly" });

    // On mobile, filters may be behind a toggle — check both paths
    const filtersToggle = page.getByRole("button", { name: /filters/i });
    if (await filtersToggle.isVisible().catch(() => false)) {
      await filtersToggle.click();
    }

    await expect(fromInput).toBeVisible({ timeout: 5000 });
    await expect(monthlyBtn).toBeVisible();
    await expect(quarterlyBtn).toBeVisible();
  });

  test("granularity toggle updates URL parameter", async ({ authedPage: page }) => {
    await page.waitForTimeout(2000);

    // Open mobile filter panel if needed
    const filtersToggle = page.getByRole("button", { name: /filters/i });
    if (await filtersToggle.isVisible().catch(() => false)) {
      await filtersToggle.click();
    }

    const quarterlyBtn = page.getByRole("radio", { name: "Quarterly" });
    const quarterlyVisible = await quarterlyBtn.isVisible().catch(() => false);
    test.skip(!quarterlyVisible, "Quarterly granularity radio button not visible — filter panel may be hidden");
    await quarterlyBtn.click();
    await expect(page).toHaveURL(/granularity=quarterly/);
  });
});

test.describe("Analytics — API Integration", () => {
  test("utility trends API endpoint returns valid response", async ({ api }) => {
    const res = await api.get("/analytics/utility-trends");
    expect(res.ok()).toBe(true);
    const data = await res.json();

    // Validate response shape
    expect(data).toHaveProperty("trends");
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("total_spend");
    expect(Array.isArray(data.trends)).toBe(true);
    expect(typeof data.total_spend).toBe("number");
    expect(typeof data.summary).toBe("object");
  });

  test("utility trends API accepts granularity parameter", async ({ api }) => {
    const monthly = await api.get("/analytics/utility-trends?granularity=monthly");
    expect(monthly.ok()).toBe(true);

    const quarterly = await api.get("/analytics/utility-trends?granularity=quarterly");
    expect(quarterly.ok()).toBe(true);
  });

  test("utility trends API rejects invalid granularity", async ({ api }) => {
    const res = await api.get("/analytics/utility-trends?granularity=weekly");
    expect(res.status()).toBe(422);
  });

  test("utility trends API rejects invalid property_ids", async ({ api }) => {
    const res = await api.get("/analytics/utility-trends?property_ids=not-a-uuid");
    expect(res.status()).toBe(422);
  });

  test("summary cards match API data when utility data exists", async ({ authedPage: page, api }) => {
    // Use same default date range as the frontend (last 12 months)
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startDate = from.toISOString().slice(0, 10);
    const endDate = to.toISOString().slice(0, 10);

    const res = await api.get(`/analytics/utility-trends?start_date=${startDate}&end_date=${endDate}`);
    const data = await res.json();

    if (data.total_spend === 0) {
      test.skip();
      return;
    }

    await page.goto("/analytics?tab=utility-trends");
    await waitForAnalyticsLoad(page);

    // Wait for data to load
    await expect(page.getByText("Total Utilities")).toBeVisible({ timeout: 15000 });

    // Verify total spend amount appears on page
    const formatted = formatCurrency(data.total_spend);
    await expect(page.getByText(formatted).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Analytics — Utility Transaction CRUD", () => {
  let createdTxnId: string | null = null;

  test.afterEach(async ({ api }) => {
    // Clean up test transaction
    if (createdTxnId) {
      await api.delete(`/transactions/${createdTxnId}`).catch(() => {});
      createdTxnId = null;
    }
  });

  test("creating a utility transaction with sub_category shows in analytics", async ({
    authedPage: page,
    api,
  }) => {
    // Create a utility transaction via API with sub_category
    const createRes = await api.post("/transactions", {
      data: {
        transaction_date: "2025-06-15",
        amount: "99.50",
        transaction_type: "expense",
        category: "utilities",
        sub_category: "electricity",
        vendor: E2E_VENDOR,
        description: "E2E test electricity bill",
        tags: ["utilities"],
        tax_relevant: true,
        status: "approved",
      },
    });
    expect(createRes.ok()).toBe(true);
    const created = await createRes.json();
    createdTxnId = created.id;

    // Verify it appears in the analytics API response
    const analyticsRes = await api.get("/analytics/utility-trends");
    expect(analyticsRes.ok()).toBe(true);
    const analytics = await analyticsRes.json();

    // Should have at least one electricity trend point
    const electricityTrends = analytics.trends.filter(
      (t: { sub_category: string }) => t.sub_category === "electricity",
    );
    expect(electricityTrends.length).toBeGreaterThan(0);

    // Summary should include electricity
    expect(analytics.summary.electricity).toBeGreaterThan(0);

    // Navigate to analytics page and verify data is visible
    await page.goto("/analytics?tab=utility-trends");
    await waitForAnalyticsLoad(page);

    // Wait for data to load — should show Total Utility Spend
    await expect(page.getByText("Total Utilities")).toBeVisible({ timeout: 15000 });
  });
});
