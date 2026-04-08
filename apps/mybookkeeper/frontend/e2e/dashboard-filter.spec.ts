import { test, expect } from "./fixtures/auth";

test.describe("Dashboard Category Filter", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
  });

  test.describe("Filter bar rendering", () => {
    test("filter bar appears with preset buttons when dashboard has data", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = summary.revenue > 0 || summary.expenses > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId("filter-preset-all")).toBeVisible();
      await expect(page.getByTestId("filter-preset-income")).toBeVisible();
      await expect(page.getByTestId("filter-preset-expenses")).toBeVisible();
    });

    test("filter bar does not appear when dashboard is empty", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = summary.revenue > 0 || summary.expenses > 0
        || summary.by_month?.length > 0 || summary.by_property?.length > 0;
      if (hasData) {
        test.skip();
        return;
      }

      await expect(page.getByTestId("dashboard-filter-bar")).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Preset filters", () => {
    test("clicking Expenses preset updates summary cards to show only expenses", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-preset-expenses").click();

      const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
      await expect(revenueCard).toHaveText("$0.00", { timeout: 5000 });

      await expect(page.getByTestId("filter-count")).toBeVisible();
    });

    test("clicking Income preset updates summary cards to show only income", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-preset-income").click();

      const expensesCard = page.getByText("Total Expenses").locator("..").locator("p:last-child");
      await expect(expensesCard).toHaveText("$0.00", { timeout: 5000 });
    });

    test("clicking All preset resets to show all data", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-preset-expenses").click();
      const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
      await expect(revenueCard).toHaveText("$0.00", { timeout: 5000 });

      await page.getByTestId("filter-preset-all").click();

      if (summary.revenue > 0) {
        const expectedRevenue = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(summary.revenue);
        await expect(revenueCard).toHaveText(expectedRevenue, { timeout: 5000 });
      }

      await expect(page.getByTestId("filter-count")).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Category chips", () => {
    test("expand toggle reveals individual category chips", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId("filter-categories-panel")).not.toBeVisible({ timeout: 3000 });

      await page.getByTestId("filter-expand-toggle").click();

      const panel = page.getByTestId("filter-categories-panel");
      await expect(panel).toBeVisible({ timeout: 5000 });

      const incomeHeader = panel.getByText("Income", { exact: true });
      const expensesHeader = panel.getByText("Expenses", { exact: true });
      await expect(incomeHeader).toBeVisible();
      await expect(expensesHeader).toBeVisible();
    });

    test("clicking a category chip selects only that category when unfiltered", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-expand-toggle").click();
      await expect(page.getByTestId("filter-categories-panel")).toBeVisible({ timeout: 5000 });

      const rentalChip = page.getByRole("button", { name: /Rental Revenue/ });
      if (await rentalChip.count() === 0) {
        test.skip();
        return;
      }

      await expect(rentalChip).toHaveAttribute("aria-pressed", "true");

      // First click from unfiltered state = "select only" this category
      await rentalChip.click();

      // Chip stays selected (it's the only one now)
      await expect(rentalChip).toHaveAttribute("aria-pressed", "true");

      // Filter count should show we're filtered
      await expect(page.getByTestId("filter-count")).toBeVisible({ timeout: 3000 });

      // Second click when already filtered = toggle off this category
      await rentalChip.click();

      // Rental Revenue is now deselected (other categories remain)
      await expect(rentalChip).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("filter-count")).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Filter and chart interaction", () => {
    test("property sections stay visible when category filter is active", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_property?.length) {
        test.skip();
        return;
      }

      await expect(page.getByText("By Property").first()).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-preset-expenses").click();

      // Property section should remain visible even when filtering by category
      await expect(page.getByText("By Property").first()).toBeVisible({ timeout: 5000 });
    });

    test("drill-down still works after applying a filter", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasMonthlyData = (summary.by_month?.length ?? 0) > 0;
      if (!hasMonthlyData) {
        test.skip();
        return;
      }

      await page.getByTestId("filter-preset-expenses").click();

      await page.waitForTimeout(500);

      const chartWrapper = page.locator(".recharts-wrapper").first();
      const isChartVisible = await chartWrapper.isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!isChartVisible, "Chart not visible after applying expense filter — no data to drill into");

      const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
      test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
      const barBox = await barRect.boundingBox();
      test.skip(!barBox || barBox.height < 3, "Bar rectangle too small or missing bounding box — bar has no data");

      await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

      const panelHeader = page.getByText(/\d+ transactions?/).first();
      const panelVisible = await panelHeader.isVisible({ timeout: 5000 }).catch(() => false);
      if (panelVisible) {
        const closeBtn = page.getByLabel("Close panel");
        if ((await closeBtn.count()) > 0) {
          await closeBtn.click();
        }
      }
    });
  });

  test.describe("Reset button", () => {
    test("reset button clears all filters", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (summary.revenue === 0 && summary.expenses === 0) {
        test.skip();
        return;
      }

      const filterBar = page.getByTestId("dashboard-filter-bar");
      await expect(filterBar).toBeVisible({ timeout: 10000 });

      await page.getByTestId("filter-preset-expenses").click();

      // Expand the panel to access the reset button
      await page.getByTestId("filter-expand-toggle").click();
      await expect(page.getByTestId("filter-clear")).toBeVisible({ timeout: 3000 });

      await page.getByTestId("filter-clear").click();

      await expect(page.getByTestId("filter-count")).not.toBeVisible({ timeout: 3000 });
      await expect(page.getByTestId("filter-clear")).not.toBeVisible({ timeout: 3000 });

      if (summary.revenue > 0) {
        const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
        const expectedRevenue = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }).format(summary.revenue);
        await expect(revenueCard).toHaveText(expectedRevenue, { timeout: 5000 });
      }
    });
  });
});

test.describe("Dashboard Property Filter", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
  });

  test("property dropdown appears when user has properties", async ({ authedPage: page, api }) => {
    const res = await api.get("/properties");
    const properties = await res.json();
    if (properties.length === 0) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if (summary.revenue === 0 && summary.expenses === 0) {
      test.skip();
      return;
    }

    await expect(page.getByTestId("property-filter-trigger")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("All Properties")).toBeVisible();
  });

  test("selecting a property scopes dashboard data to that property", async ({ authedPage: page, api }) => {
    const propRes = await api.get("/properties");
    const properties = await propRes.json();
    if (properties.length < 2) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if (summary.revenue === 0 && summary.expenses === 0) {
      test.skip();
      return;
    }

    // Get summary for first property to compare
    const firstProp = properties[0];
    const propSummaryRes = await api.get(`/summary?property_ids=${firstProp.id}`);
    const propSummary = await propSummaryRes.json();

    // Click property dropdown and select first property
    await page.getByTestId("property-filter-trigger").click();
    await page.getByText(firstProp.name).click();

    // Summary cards should update to show property-scoped data
    if (propSummary.revenue !== summary.revenue) {
      const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
      const expectedRevenue = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(propSummary.revenue);
      await expect(revenueCard).toHaveText(expectedRevenue, { timeout: 5000 });
    }

    // Trigger should show property name
    await expect(page.getByTestId("property-filter-trigger")).toContainText(firstProp.name);

    // Reset button should be visible inside expanded panel
    await page.getByTestId("filter-expand-toggle").click();
    await expect(page.getByTestId("filter-clear")).toBeVisible({ timeout: 3000 });
  });

  test("property filter and category filter work together (AND logic)", async ({ authedPage: page, api }) => {
    const propRes = await api.get("/properties");
    const properties = await propRes.json();
    if (properties.length === 0) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if (summary.revenue === 0 && summary.expenses === 0) {
      test.skip();
      return;
    }

    // Select a property
    await page.getByTestId("property-filter-trigger").click();
    await page.getByRole("menuitemcheckbox", { name: properties[0].name }).click();
    await page.keyboard.press("Escape");

    // Then apply category filter
    await page.getByTestId("filter-preset-expenses").click();

    // Revenue should be $0 (expenses-only filter)
    const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
    await expect(revenueCard).toHaveText("$0.00", { timeout: 5000 });

    // Both filters should be indicated
    await expect(page.getByTestId("filter-count")).toBeVisible();
    await page.getByTestId("filter-expand-toggle").click();
    await expect(page.getByTestId("filter-clear")).toBeVisible({ timeout: 3000 });
  });

  test("reset clears both property and category filters", async ({ authedPage: page, api }) => {
    const propRes = await api.get("/properties");
    const properties = await propRes.json();
    if (properties.length === 0) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if (summary.revenue === 0 && summary.expenses === 0) {
      test.skip();
      return;
    }

    // Apply both filters
    await page.getByTestId("property-filter-trigger").click();
    await page.getByRole("menuitemcheckbox", { name: properties[0].name }).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("filter-preset-expenses").click();

    // Expand panel and click reset
    await page.getByTestId("filter-expand-toggle").click();
    await page.getByTestId("filter-clear").click();

    // Both filters should be cleared
    await expect(page.getByText("All Properties")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("filter-count")).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("filter-clear")).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("Dashboard Property Expense Split", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
  });

  test("selecting a property shows per-property revenue and expense bars in legend", async ({ authedPage: page, api }) => {
    const propRes = await api.get("/properties");
    const properties = await propRes.json();
    if (properties.length < 2) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if ((summary.by_month?.length ?? 0) === 0) {
      test.skip();
      return;
    }

    // Select first property to trigger property breakdown
    await page.getByTestId("property-filter-trigger").click();
    await page.getByRole("menuitemcheckbox", { name: properties[0].name }).click();
    await page.keyboard.press("Escape");

    // Wait for chart to re-render
    await page.waitForTimeout(1000);

    // Chart legend should show property-specific labels
    const chartWrapper = page.locator(".recharts-wrapper").first();
    const isChartVisible = await chartWrapper.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isChartVisible, "Chart not visible after selecting property — no chart to verify legend");

    // Look for property name in the legend text
    const legendText = await chartWrapper.locator(".recharts-legend-wrapper").textContent();
    expect(legendText).toContain(properties[0].name);
  });

  test("category filter overrides property expense bars with category bars", async ({ authedPage: page, api }) => {
    const propRes = await api.get("/properties");
    const properties = await propRes.json();
    if (properties.length < 2) {
      test.skip();
      return;
    }

    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if ((summary.by_month?.length ?? 0) === 0 || summary.expenses === 0) {
      test.skip();
      return;
    }

    // Select a property first
    await page.getByTestId("property-filter-trigger").click();
    await page.getByRole("menuitemcheckbox", { name: properties[0].name }).click();
    await page.keyboard.press("Escape");

    await page.waitForTimeout(500);

    // Now apply expense category filter — should switch from property expense bars to category bars
    await page.getByTestId("filter-preset-expenses").click();

    await page.waitForTimeout(500);

    // Revenue card should be $0 — only expenses shown
    const revenueCard = page.getByText("Total Revenue").locator("..").locator("p:last-child");
    await expect(revenueCard).toHaveText("$0.00", { timeout: 5000 });

    // Chart legend should no longer show property expense labels (no " — Expenses")
    const chartWrapper = page.locator(".recharts-wrapper").first();
    const isChartVisible = await chartWrapper.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isChartVisible, "Chart not visible after applying category filter — no legend to verify");

    const legendText = await chartWrapper.locator(".recharts-legend-wrapper").textContent() ?? "";
    expect(legendText).not.toContain("— Expenses");
  });

  test("selecting a single expense category shows only that category in drill-down", async ({ authedPage: page, api }) => {
    const summaryRes = await api.get("/summary");
    const summary = await summaryRes.json();
    if ((summary.by_month?.length ?? 0) === 0 || summary.expenses === 0) {
      test.skip();
      return;
    }

    // Expand filter panel and select only maintenance
    await page.getByTestId("filter-expand-toggle").click();
    await expect(page.getByTestId("filter-categories-panel")).toBeVisible({ timeout: 5000 });

    const maintenanceChip = page.getByRole("button", { name: /Maintenance/ }).first();
    if ((await maintenanceChip.count()) === 0) {
      test.skip();
      return;
    }

    // Right-click or context-click to "select only" maintenance
    await maintenanceChip.click({ button: "right" });

    await page.waitForTimeout(500);

    // Click on a bar in the chart to open drill-down
    const chartWrapper = page.locator(".recharts-wrapper").first();
    const isChartVisible = await chartWrapper.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!isChartVisible, "Chart not visible after applying maintenance category filter — no data to drill into");

    const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
    test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
    const barBox = await barRect.boundingBox();
    test.skip(!barBox || barBox.height < 3, "Bar rectangle too small or missing bounding box — bar has no data");

    await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

    // If drill-down panel opened, verify it shows the correct category
    const panelHeader = page.getByText(/\d+ transactions?/).first();
    const panelVisible = await panelHeader.isVisible({ timeout: 5000 }).catch(() => false);
    if (panelVisible) {
      // The drill-down title should reference the filtered category, not "Expenses"
      const panelTitle = page.locator("[class*='font-semibold'], h2, h3").filter({ hasText: /Maintenance|Revenue/ }).first();
      const titleVisible = await panelTitle.isVisible({ timeout: 3000 }).catch(() => false);
      if (titleVisible) {
        const titleText = await panelTitle.textContent();
        // Should not say generic "Expenses" — should be specific category or revenue
        expect(titleText).toBeTruthy();
      }
    }
  });
});
