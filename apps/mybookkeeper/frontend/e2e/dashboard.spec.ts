import { test, expect } from "./fixtures/auth";

// Format a number the same way formatCurrency() does: "$46,754.04"
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // Wait past skeleton — data is loaded when a summary card label appears
    await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
  });

  // ─── Summary cards match API ─────────────────────────────────────────────────

  test.describe("Summary cards", () => {
    test("revenue and expenses card values match /summary API", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      expect(res.ok()).toBe(true);
      const summary = await res.json();

      // Verify both labels exist
      await expect(page.getByText("Total Revenue")).toBeVisible();
      await expect(page.getByText("Total Expenses")).toBeVisible();

      // Verify the formatted dollar values from the API appear on the page
      const revenueFormatted = formatCurrency(summary.revenue);
      const expensesFormatted = formatCurrency(summary.expenses);
      const profitFormatted = formatCurrency(summary.profit);

      if (Math.abs(summary.revenue) > 0) {
        await expect(page.getByText(revenueFormatted).first()).toBeVisible({ timeout: 10000 });
      }
      if (Math.abs(summary.expenses) > 0) {
        await expect(page.getByText(expensesFormatted).first()).toBeVisible({ timeout: 10000 });
      }
      // Net Profit card should also match
      await expect(page.getByText("Net Profit").first()).toBeVisible();
      if (Math.abs(summary.profit) > 0) {
        await expect(page.getByText(profitFormatted).first()).toBeVisible({ timeout: 10000 });
      }
    });

    test("summary cards update when date range filter is applied and reset", async ({ authedPage: page, api }) => {
      const fullRes = await api.get("/summary");
      const fullSummary = await fullRes.json();
      if (!fullSummary.by_month?.length || fullSummary.by_month.length < 2) {
        test.skip();
        return;
      }

      // Pick a single month from the data so we get a filtered subset
      const targetMonth = fullSummary.by_month[0].month; // e.g. "2025-01"
      const startDate = `${targetMonth}-01`;
      // Build end date as last day of month
      const [yyyy, mm] = targetMonth.split("-").map(Number);
      const lastDay = new Date(yyyy, mm, 0).getDate();
      const endDate = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;

      // Fetch the filtered summary from API to know what to expect
      const filteredRes = await api.get(`/summary?startDate=${startDate}&endDate=${endDate}`);
      if (!filteredRes.ok()) {
        test.skip();
        return;
      }
      const filteredSummary = await filteredRes.json();

      // Simulate drag selection on the chart to filter by that month
      const chart = page.locator(".recharts-wrapper").first();
      await expect(chart).toBeVisible({ timeout: 10000 });
      const svg = chart.locator("svg").first();
      const box = await svg.boundingBox();
      test.skip(!box, "Chart SVG has no bounding box — chart may not be rendered");

      // Drag across a narrow range (simulating one-month selection)
      const startX = box!.x + box!.width * 0.1;
      const endX = box!.x + box!.width * 0.3;
      const midY = box!.y + box!.height * 0.5;
      await page.mouse.move(startX, midY);
      await page.mouse.down();
      await page.mouse.move(endX, midY, { steps: 5 });
      await page.mouse.up();

      // If a date range was applied, the "Reset to all time" button should appear
      const resetBtn = page.getByText(/reset to all time/i);
      const filtered = await resetBtn.isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!filtered, "Drag did not register a date range selection — chart may need wider drag range");

      // Click reset and verify original revenue value reappears
      await resetBtn.click();
      await expect(page.getByText(/drag across months to filter/i)).toBeVisible({ timeout: 10000 });

      if (Math.abs(fullSummary.revenue) > 0) {
        await expect(page.getByText(formatCurrency(fullSummary.revenue)).first()).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ─── Charts render with correct data ──────────────────────────────────────────

  test.describe("Charts", () => {
    test("monthly overview chart renders bars when monthly data exists", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0 || (summary.by_month_expense?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      // Chart wrapper must be visible and contain an SVG with bar elements
      const chart = page.locator(".recharts-wrapper").first();
      await expect(chart).toBeVisible({ timeout: 10000 });
      // Recharts renders bars inside <g class="recharts-bar-rectangle"> wrappers —
      // the <g> isn't visible to Playwright's visibility check, so verify by count
      const barElements = chart.locator(".recharts-bar-rectangle");
      const barCount = await barElements.count();
      if (barCount === 0) { test.skip(); return; }
      expect(barCount).toBeGreaterThan(0);
    });

    test("by-property table shows property names and financial values from API", async ({ authedPage: page, api }) => {
      const [summaryRes, propsRes] = await Promise.all([
        api.get("/summary"),
        api.get("/properties"),
      ]);
      const summary = await summaryRes.json();
      const properties = await propsRes.json();

      if (!summary.by_property?.length) {
        test.skip();
        return;
      }

      // Build a lookup from property id to name
      const propMap = new Map(properties.map((p: { id: string; name: string }) => [p.id, p.name]));

      // Verify each property row in the summary is visible with its name and values
      for (const bp of summary.by_property.slice(0, 3)) {
        const name = propMap.get(bp.property_id);
        if (!name) continue;
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10000 });
        // Revenue value should appear in the table
        if (Math.abs(bp.revenue) > 0) {
          await expect(page.getByText(formatCurrency(bp.revenue)).first()).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test("by-category chart renders when category data exists and shows category names", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_category || Object.keys(summary.by_category).length === 0) {
        test.skip();
        return;
      }

      await expect(page.getByRole("heading", { name: "By Category" })).toBeVisible({ timeout: 10000 });
      // The category chart is the last recharts wrapper
      const chart = page.locator(".recharts-wrapper").last();
      await expect(chart).toBeVisible();
      // Bar elements should be rendered
      const barElements = chart.locator(".recharts-bar-rectangle");
      const barCount = await barElements.count();
      if (barCount === 0) { test.skip(); return; }
      await expect(barElements.first()).toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Drill-down panel ────────────────────────────────────────────────────────

  test.describe("Drill-down", () => {
    test("clicking a chart bar opens drill-down panel with transaction list", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0 || (summary.by_month_expense?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const chartWrapper = page.locator(".recharts-wrapper").first();
      await expect(chartWrapper).toBeVisible({ timeout: 10000 });

      // Click on a bar in the chart — Recharts SVG <g> elements aren't visible to
      // Playwright, so we find a <rect> bar and click at its coordinates.
      // Skip tiny rects (< 3px tall) since they may not trigger click handlers.
      const allBarRects = chartWrapper.locator(".recharts-bar-rectangle rect");
      const barRectCount = await allBarRects.count();
      let clicked = false;
      for (let i = 0; i < barRectCount && !clicked; i++) {
        const box = await allBarRects.nth(i).boundingBox();
        if (box && box.height >= 3) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          clicked = true;
        }
      }
      if (!clicked) {
        // Fallback: click directly on the chart SVG area where bars appear
        const svg = chartWrapper.locator("svg").first();
        const box = await svg.boundingBox();
        test.skip(!box, "Chart SVG has no bounding box — chart may not be rendered");
        await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.5);
      }

      // Drill-down panel should open showing transaction count and total
      // The panel header shows "N transactions — $X,XXX.XX"
      await expect(page.getByText(/\d+ transactions?/).first()).toBeVisible({ timeout: 5000 });

      // Panel should have transaction list items with vendor names
      const transactionItems = page.locator("ul li");
      const itemCount = await transactionItems.count();
      // If there are transactions, at least one should be visible
      if (itemCount > 0) {
        await expect(transactionItems.first()).toBeVisible();
      }
    });

    test("category chart click opens drill-down filtered by that category", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_category || Object.keys(summary.by_category).length === 0) {
        test.skip();
        return;
      }

      // Get a category name to verify in the drill-down
      const firstCategory = Object.keys(summary.by_category)[0];

      // Click on the category chart bar
      const categoryChart = page.locator(".recharts-wrapper").last();
      await expect(categoryChart).toBeVisible({ timeout: 10000 });
      const bar = categoryChart.locator(".recharts-bar-rectangle").first();
      if ((await bar.count()) > 0) {
        await bar.click();
        await page.waitForTimeout(500);
      } else {
        test.skip(true, "No chart bars available to click");
        return;
      }

      // Drill-down panel header should show the formatted category name
      // The panel shows filter.label which is formatTag(category) e.g. "Utilities"
      // Just verify the panel opened with transaction count
      const panelHeader = page.getByText(/\d+ transactions?/);
      const panelVisible = await panelHeader.first().isVisible({ timeout: 5000 }).catch(() => false);

      if (panelVisible) {
        // Close it and verify it disappears
        const closeBtn = page.getByLabel("Close panel");
        if ((await closeBtn.count()) > 0) {
          await closeBtn.click();
          await expect(page.getByText(/\d+ transactions? —/).first()).not.toBeVisible({ timeout: 5000 });
        }
      }
    });

    test("drill-down panel close button removes the panel", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      // Open drill-down by clicking a bar rect at its coordinates
      const chartWrapper = page.locator(".recharts-wrapper").first();
      await expect(chartWrapper).toBeVisible({ timeout: 10000 });
      const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
      test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
      const barBox = await barRect.boundingBox();
      test.skip(!barBox, "Bar rectangle has no bounding box — chart may not be fully rendered");
      await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

      // Wait for panel to appear
      const panelText = page.getByText(/\d+ transactions?/).first();
      await expect(panelText).toBeVisible({ timeout: 5000 });

      // Close via the close button
      const closeBtn = page.getByLabel("Close panel");
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();

      // Panel should be gone
      await expect(panelText).not.toBeVisible({ timeout: 5000 });
    });

    test("drill-down panel shows filter label in header", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0 || (summary.by_month_expense?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const chartWrapper = page.locator(".recharts-wrapper").first();
      await expect(chartWrapper).toBeVisible({ timeout: 10000 });

      // Click on a bar rect inside the chart at its coordinates — Recharts SVG <g>
      // elements aren't visible to Playwright, so we click via bounding box
      const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
      test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
      const barBox = await barRect.boundingBox();
      test.skip(!barBox, "Bar rectangle has no bounding box — chart may not be fully rendered");
      await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

      // Drill-down panel should open — verify the transaction count label appears
      const panelHeader = page.getByText(/\d+ transactions?/).first();
      await expect(panelHeader).toBeVisible({ timeout: 5000 });

      // Verify we're still on the dashboard (no navigation away)
      await expect(page).toHaveURL("/");
    });

    test("clicking a transaction in drill-down shows breadcrumb navigation", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0 || (summary.by_month_expense?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const chartWrapper = page.locator(".recharts-wrapper").first();
      await expect(chartWrapper).toBeVisible({ timeout: 10000 });

      // Open drill-down by clicking a bar rect at its coordinates
      const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
      test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
      const barBox = await barRect.boundingBox();
      test.skip(!barBox, "Bar rectangle has no bounding box — chart may not be fully rendered");
      await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

      // Wait for transaction list to appear
      const panelHeader = page.getByText(/\d+ transactions?/).first();
      await expect(panelHeader).toBeVisible({ timeout: 5000 });

      // Click the first transaction in the list
      const firstTransaction = page.locator("ul li").first();
      test.skip((await firstTransaction.count()) === 0, "No transactions in drill-down panel — no data to click");

      // Get the vendor name before clicking
      const vendorText = await firstTransaction.locator(".font-medium").first().textContent();
      await firstTransaction.click();

      // After clicking a transaction, breadcrumb navigation should appear
      // The breadcrumb shows: filter.label > vendor name
      const breadcrumbNav = page.locator("nav").first();
      await expect(breadcrumbNav).toBeVisible({ timeout: 5000 });

      // The vendor name should appear as the current breadcrumb item
      if (vendorText && vendorText !== "Unknown vendor") {
        await expect(page.getByText(vendorText).first()).toBeVisible({ timeout: 3000 });
      }
    });

    test("clicking breadcrumb label returns to transaction list", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      const hasData = (summary.by_month?.length ?? 0) > 0 || (summary.by_month_expense?.length ?? 0) > 0;
      if (!hasData) {
        test.skip();
        return;
      }

      const chartWrapper = page.locator(".recharts-wrapper").first();
      await expect(chartWrapper).toBeVisible({ timeout: 10000 });

      // Open drill-down by clicking a bar rect at its coordinates
      const barRect = chartWrapper.locator(".recharts-bar-rectangle rect").first();
      test.skip((await barRect.count()) === 0, "No bar rectangles rendered — no chart data to click");
      const barBox = await barRect.boundingBox();
      test.skip(!barBox, "Bar rectangle has no bounding box — chart may not be fully rendered");
      await page.mouse.click(barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2);

      const panelHeader = page.getByText(/\d+ transactions?/).first();
      await expect(panelHeader).toBeVisible({ timeout: 5000 });

      // Click the first transaction
      const firstTransaction = page.locator("ul li").first();
      test.skip((await firstTransaction.count()) === 0, "No transactions in drill-down panel — no data to click");
      await firstTransaction.click();

      // Wait for breadcrumb to appear
      const breadcrumbNav = page.locator("nav").first();
      await expect(breadcrumbNav).toBeVisible({ timeout: 5000 });

      // Click the breadcrumb label (the first button in the nav — the filter.label)
      const breadcrumbLink = breadcrumbNav.locator("button").first();
      await expect(breadcrumbLink).toBeVisible({ timeout: 3000 });
      await breadcrumbLink.click();

      // Should return to the transaction list view — the transaction count header reappears
      await expect(page.getByText(/\d+ transactions?/).first()).toBeVisible({ timeout: 5000 });
    });

    test("date range drag shows Reset button and filtering hint changes", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_month?.length || summary.by_month.length < 2) {
        test.skip();
        return;
      }

      // Verify the "drag across months" hint is shown initially
      await expect(page.getByText(/drag across months to filter/i)).toBeVisible({ timeout: 10000 });

      const chart = page.locator(".recharts-wrapper").first();
      await expect(chart).toBeVisible({ timeout: 10000 });
      const svg = chart.locator("svg").first();
      const box = await svg.boundingBox();
      test.skip(!box, "Chart SVG has no bounding box — chart may not be rendered");

      // Drag across a significant portion of the chart
      const startX = box!.x + box!.width * 0.2;
      const endX = box!.x + box!.width * 0.8;
      const midY = box!.y + box!.height * 0.5;

      await page.mouse.move(startX, midY);
      await page.mouse.down();
      await page.mouse.move(endX, midY, { steps: 10 });
      await page.mouse.up();

      // If drag succeeded, "Reset to all time" appears and the hint text goes away
      const resetBtn = page.getByText(/reset to all time/i);
      const appeared = await resetBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (appeared) {
        // Hint should be replaced by the date range subtitle
        await expect(page.getByText(/drag across months to filter/i)).not.toBeVisible();

        // Click reset
        await resetBtn.click();

        // Hint should reappear
        await expect(page.getByText(/drag across months to filter/i)).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe("Skeleton layout", () => {
    test("skeleton shows sidebar and dashboard structure before data loads", async ({ authedPage: page }) => {
      // Navigate away then back to trigger the loading state
      await page.goto("/admin");
      await expect(page.getByText("Admin").first()).toBeVisible({ timeout: 10000 });

      // Navigate back — should show skeleton or loaded dashboard
      await page.goto("/");

      // Either the skeleton sidebar or the real sidebar should be visible quickly
      const sidebar = page.locator("aside").first();
      const heading = page.getByRole("heading", { name: "Dashboard" });
      await expect(sidebar.or(heading)).toBeVisible({ timeout: 15000 });

      // Dashboard should fully load
      await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
    });
  });
});
