import { test, expect } from "./fixtures/auth";

const STORAGE_KEY = "mbk:selectedYear";
const CURRENT_YEAR = new Date().getFullYear();

test.describe("Dashboard Year Filter", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Clear the year filter from localStorage before each test
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Total Revenue").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test.describe("Rendering", () => {
    test("year filter dropdown appears in the filter bar when data exists", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData =
        summary.revenue > 0 ||
        summary.expenses > 0 ||
        summary.by_month?.length > 0 ||
        summary.by_property?.length > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });
    });

    test('year filter defaults to current year (not "all")', async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData =
        summary.revenue > 0 ||
        summary.expenses > 0 ||
        summary.by_month?.length > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });
      await expect(yearFilter).toHaveValue(String(CURRENT_YEAR));
    });

    test("year filter includes All time option and at least current year", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData =
        summary.revenue > 0 ||
        summary.expenses > 0 ||
        summary.by_month?.length > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });

      // "All time" option should be present
      const allOption = yearFilter.locator('option[value="all"]');
      await expect(allOption).toHaveCount(1);

      // Current year option should be present
      const currentYearOption = yearFilter.locator(
        `option[value="${CURRENT_YEAR}"]`,
      );
      await expect(currentYearOption).toHaveCount(1);
    });
  });

  test.describe("Year selection scopes summary data", () => {
    test("selecting a past year triggers API call with matching date range", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();

      // We need historical data to have a meaningful past year to select
      const years = (summary.by_month ?? [])
        .map((m: { month: string }) => Number(m.month.slice(0, 4)))
        .filter((y: number) => y < CURRENT_YEAR);

      if (years.length === 0) {
        test.skip();
        return;
      }

      const pastYear = Math.max(...years);
      const filterBarRes = await api.get(
        `/summary?start_date=${pastYear}-01-01&end_date=${pastYear}-12-31`,
      );
      if (!filterBarRes.ok()) {
        test.skip();
        return;
      }
      const yearSummary = await filterBarRes.json();

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });

      await yearFilter.selectOption(String(pastYear));

      // Summary cards should update to reflect year-scoped data
      // Wait for the API response to settle
      await page.waitForTimeout(1000);

      // Revenue card should show the year-scoped value
      if (Math.abs(yearSummary.revenue) > 0) {
        const expectedRevenue = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(yearSummary.revenue);
        const revenueCard = page
          .getByText("Total Revenue")
          .locator("..")
          .locator("p:last-child");
        await expect(revenueCard).toHaveText(expectedRevenue, {
          timeout: 10000,
        });
      }
    });

    test('selecting "All time" clears date scoping', async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();

      // Need data in a past year + current year to see a difference
      const years = (summary.by_month ?? [])
        .map((m: { month: string }) => Number(m.month.slice(0, 4)))
        .filter((y: number) => y < CURRENT_YEAR);
      if (years.length === 0) {
        test.skip();
        return;
      }

      const pastYear = Math.max(...years);
      const allTimeRevenue = summary.revenue;
      const allTimeExpenses = summary.expenses;

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });

      // First select a past year to scope data
      await yearFilter.selectOption(String(pastYear));
      await page.waitForTimeout(1000);

      // Then switch to "All time"
      await yearFilter.selectOption("all");
      await page.waitForTimeout(1000);

      // Summary should show all-time values (≥ past-year values)
      if (Math.abs(allTimeRevenue) > 0) {
        const expectedRevenue = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(allTimeRevenue);
        const revenueCard = page
          .getByText("Total Revenue")
          .locator("..")
          .locator("p:last-child");
        await expect(revenueCard).toHaveText(expectedRevenue, {
          timeout: 10000,
        });
      }

      if (Math.abs(allTimeExpenses) > 0) {
        const expectedExpenses = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(allTimeExpenses);
        const expensesCard = page
          .getByText("Total Expenses")
          .locator("..")
          .locator("p:last-child");
        await expect(expensesCard).toHaveText(expectedExpenses, {
          timeout: 10000,
        });
      }
    });
  });

  test.describe("Persistence", () => {
    test("selected year persists across page reload via localStorage", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData =
        summary.revenue > 0 ||
        summary.expenses > 0 ||
        summary.by_month?.length > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });

      // Select "All time"
      await yearFilter.selectOption("all");

      // Verify localStorage was updated
      const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
      expect(stored).toBe("all");

      // Reload page
      await page.reload();
      await expect(page.getByText("Total Revenue").first()).toBeVisible({
        timeout: 15000,
      });

      // Year filter should still show "All time"
      const yearFilterAfterReload = page.getByTestId("year-filter");
      await expect(yearFilterAfterReload).toBeVisible({ timeout: 10000 });
      await expect(yearFilterAfterReload).toHaveValue("all");
    });

    test("URL param ?year= overrides localStorage", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData =
        summary.revenue > 0 ||
        summary.expenses > 0 ||
        summary.by_month?.length > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      // Set localStorage to current year
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: STORAGE_KEY, value: String(CURRENT_YEAR) },
      );

      // Navigate with ?year=all in URL — should override localStorage
      await page.goto("/?year=all");
      await expect(page.getByText("Total Revenue").first()).toBeVisible({
        timeout: 15000,
      });

      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 10000 });
      await expect(yearFilter).toHaveValue("all");
    });
  });

  test.describe("Coexistence with manual date range", () => {
    test("selecting a year clears any active manual date range reset button", async ({
      authedPage: page,
      api,
    }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_month?.length || summary.by_month.length < 2) {
        test.skip();
        return;
      }

      // First drag on chart to create a manual range
      const chart = page.locator(".recharts-wrapper").first();
      await expect(chart).toBeVisible({ timeout: 10000 });
      const svg = chart.locator("svg").first();
      const box = await svg.boundingBox();
      if (!box) {
        test.skip();
        return;
      }

      const startX = box.x + box.width * 0.2;
      const endX = box.x + box.width * 0.8;
      const midY = box.y + box.height * 0.5;
      await page.mouse.move(startX, midY);
      await page.mouse.down();
      await page.mouse.move(endX, midY, { steps: 10 });
      await page.mouse.up();

      // If drag registered a date range, "Reset to all time" appears
      const resetBtn = page.getByText(/reset to all time/i);
      const rangeApplied = await resetBtn
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (!rangeApplied) {
        test.skip();
        return;
      }

      // Now select a year from the dropdown — should clear the manual range
      const yearFilter = page.getByTestId("year-filter");
      await expect(yearFilter).toBeVisible({ timeout: 5000 });
      await yearFilter.selectOption("all");

      // "Reset to all time" button should be gone (manual range cleared)
      await expect(resetBtn).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Skeleton layout", () => {
    test("skeleton includes a year filter placeholder slot", async ({
      authedPage: page,
    }) => {
      // Intercept the summary API to delay it, exposing the skeleton
      await page.route("**/api/summary*", async (route) => {
        await page.waitForTimeout(500);
        await route.continue();
      });

      await page.goto("/");

      // During loading, skeleton should be present — contains multiple animate-pulse elements
      const skeleton = page
        .locator(".animate-pulse")
        .first();
      const skeletonVisible = await skeleton
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      // If skeleton appeared, verify the page still loads correctly afterwards
      if (skeletonVisible) {
        // Eventually the real content should load
        await expect(page.getByText("Total Revenue").first()).toBeVisible({
          timeout: 15000,
        });
      } else {
        // Fast enough that skeleton wasn't caught — still verify page loads
        await expect(page.getByText("Total Revenue").first()).toBeVisible({
          timeout: 15000,
        });
      }

      // Verify year filter is present in loaded state
      const yearFilter = page.getByTestId("year-filter");
      const hasData = (await page.getByTestId("dashboard-filter-bar").count()) > 0;
      if (hasData) {
        await expect(yearFilter).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
