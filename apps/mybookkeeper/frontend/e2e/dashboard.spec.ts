/**
 * Dashboard — E2E tests against known data: a fresh organization seeded with
 * DASHBOARD_SEED, so every total on the page is exact.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { holdRequests } from "./fixtures/hold-requests";
import { SoloOrg } from "./fixtures/solo-org";
import { DASHBOARD_SEED as SEED, seedDashboard } from "./fixtures/dashboard-seed";

let solo: SoloOrg | undefined;

test.beforeAll(async ({ playwright }) => {
  solo = await SoloOrg.create(playwright, "dashboard");
  await seedDashboard(solo.api);
});

test.afterAll(async ({ playwright }) => {
  await solo?.delete(playwright);
});

function org(): SoloOrg {
  if (!solo) throw new Error("the dashboard organization was not created");
  return solo;
}

/** The card a heading titles. */
function card(page: Page, title: string): Locator {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

async function expectSummaryCards(page: Page, totals: { revenue: string; expenses: string; profit: string }) {
  const cards = page.getByTestId("dashboard-summary-cards").locator(":scope > *");
  await expect(cards.filter({ hasText: "Total Revenue" })).toContainText(totals.revenue);
  await expect(cards.filter({ hasText: "Total Expenses" })).toContainText(totals.expenses);
  await expect(cards.filter({ hasText: "Net Profit" })).toContainText(totals.profit);
}

/** The chart inside a titled card. */
function chartIn(page: Page, title: string): Locator {
  return card(page, title).locator(".recharts-wrapper");
}

/** A chart's bars for one series (Recharts names each bar after it), in data order. */
function bars(chart: Locator, series: string): Locator {
  return chart.locator(`path.recharts-rectangle[name="${series}"]`);
}

/** The x-axis label for a month, e.g. "Jan 26". */
function monthLabel(chart: Locator, month: string): Locator {
  return chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-label").filter({ hasText: month });
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-summary-cards")).toBeVisible({ timeout: 15000 });
  });

  // ─── Summary cards ───────────────────────────────────────────────────────────

  test.describe("Summary cards", () => {
    test("show the year's revenue, expenses and net profit", async ({ page }) => {
      await expectSummaryCards(page, SEED.totals);
    });

    test("the monthly average divides by the months that have data", async ({ page }) => {
      const average = card(page, "Monthly Average");
      await expect(average).toContainText("across 3 months");
      await expect(average.locator("div", { hasText: /^Revenue/ })).toContainText(SEED.monthlyAverage.revenue);
      await expect(average.locator("div", { hasText: /^Expenses/ })).toContainText(SEED.monthlyAverage.expenses);
      await expect(average.locator("div", { hasText: /^Profit/ })).toContainText(SEED.monthlyAverage.profit);
    });

    test("dragging January to February narrows the totals, and Reset restores them", async ({ page }) => {
      const chart = chartIn(page, "Monthly Overview");
      await chart.scrollIntoViewIfNeeded();
      const jan = (await monthLabel(chart, "Jan").boundingBox())!;
      const feb = (await monthLabel(chart, "Feb").boundingBox())!;
      const plot = (await chart.locator(":scope > svg").boundingBox())!;
      const y = plot.y + plot.height / 2;

      await page.mouse.move(jan.x + jan.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(feb.x + feb.width / 2, y, { steps: 5 });
      await page.mouse.up();

      const lastOfFeb = new Date(SEED.year, 2, 0).getDate();
      await expect(page.getByText(`${SEED.year}-01-01 — ${SEED.year}-02-${lastOfFeb}`)).toBeVisible();
      await expectSummaryCards(page, SEED.janFeb);

      await page.getByRole("button", { name: /reset to all time/i }).click();
      await expect(page.getByText(/drag across months to filter/i)).toBeVisible();
      await expectSummaryCards(page, SEED.totals);
    });
  });

  // ─── Charts ──────────────────────────────────────────────────────────────────

  test.describe("Charts", () => {
    test("the monthly overview draws a revenue bar per month and an expense bar per category and month", async ({ page }) => {
      const chart = chartIn(page, "Monthly Overview");
      await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-label")).toHaveText([
        `Jan ${SEED.year % 100}`,
        `Feb ${SEED.year % 100}`,
        `Mar ${SEED.year % 100}`,
      ]);
      await expect(bars(chart, "Revenue")).toHaveCount(3);
      await expect(bars(chart, "maintenance")).toHaveCount(2);
      await expect(bars(chart, "utilities")).toHaveCount(1);
    });

    test("the by-property table shows each property's revenue, expenses and profit", async ({ page }) => {
      const table = card(page, "By Property");
      for (const key of ["north", "south"] as const) {
        const row = table.locator("tbody tr").filter({ hasText: SEED.properties[key] });
        const expected = SEED.byProperty[key];
        await expect(row.locator("td")).toHaveText([SEED.properties[key], expected.revenue, expected.expenses, expected.profit]);
      }
    });

    test("the by-category chart lists the seeded categories, largest first", async ({ page }) => {
      const chart = chartIn(page, "By Category");
      await expect(chart.locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-label")).toHaveText([
        "Rental Revenue",
        "Utilities",
        "Maintenance",
      ]);
    });
  });

  // ─── Drill-down panel ────────────────────────────────────────────────────────

  test.describe("Drill-down", () => {
    /** February's revenue bar: one rent payment, $1,800. */
    async function openFebruaryRevenue(page: Page): Promise<void> {
      await bars(chartIn(page, "Monthly Overview"), "Revenue").nth(1).click();
    }

    test("clicking a monthly revenue bar lists that month's income", async ({ page }) => {
      await openFebruaryRevenue(page);
      const panel = page.getByRole("dialog");
      await expect(panel.getByText(`Revenue — February ${SEED.year}`)).toBeVisible();
      await expect(panel.getByText("1 transaction — $1,800.00")).toBeVisible();
      await expect(panel.locator("ul li")).toHaveCount(1);
      await expect(panel.locator("ul li")).toContainText(["E2E Tenant Feb"]);
      await expect(page).toHaveURL("/");
    });

    test("opening a transaction shows a breadcrumb, and Back returns to the list", async ({ page }) => {
      await openFebruaryRevenue(page);
      const panel = page.getByRole("dialog");
      await panel.locator("ul li").filter({ hasText: "E2E Tenant Feb" }).click();

      const breadcrumb = panel.locator("nav");
      await expect(breadcrumb).toContainText(`Revenue — February ${SEED.year}`);
      await expect(breadcrumb).toContainText("E2E Tenant Feb");

      await panel.getByTitle("Back to list").click();
      await expect(panel.getByText("1 transaction — $1,800.00")).toBeVisible();
      await expect(breadcrumb).toHaveCount(0);
    });

    test("clicking a category bar lists that category's transactions, and Close removes the panel", async ({ page }) => {
      await bars(chartIn(page, "By Category"), "Maintenance").click();

      const panel = page.getByRole("dialog");
      await expect(panel.getByText("2 transactions — $450.00")).toBeVisible();
      await expect(panel.locator("ul li")).toContainText(["E2E Plumber Mar", "E2E Plumber Jan"]);

      await panel.getByLabel("Close panel").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });

  test.describe("Skeleton layout", () => {
    test("skeleton shows sidebar and dashboard structure before data loads", async ({ page }) => {
      // Hold the summary request so the skeleton stays up long enough to inspect.
      const releaseSummary = await holdRequests(page, (url) => url.pathname === "/api/summary");

      await page.goto("/");

      const skeleton = page.getByTestId("dashboard-skeleton");
      await expect(skeleton).toBeVisible({ timeout: 10000 });
      await expect(page.locator("aside").first()).toBeVisible();
      const skeletonCards = page.getByTestId("dashboard-skeleton-summary-cards");
      await expect(skeletonCards.locator(":scope > *")).toHaveCount(3);
      const skeletonColumns = await skeletonCards.evaluate((el) => getComputedStyle(el).gridTemplateColumns);

      releaseSummary();

      await expect(skeleton).toHaveCount(0, { timeout: 15000 });
      const cards = page.getByTestId("dashboard-summary-cards");
      await expect(cards.locator(":scope > *")).toHaveCount(3);
      await expect(cards.getByText("Total Revenue")).toBeVisible();
      expect(await cards.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).toBe(skeletonColumns);
    });
  });
});
