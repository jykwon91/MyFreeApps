/**
 * No-backend E2E: the Tax Report and Dashboard totals always belong to the year
 * that is selected.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Both pages used to read RTK Query's `data`, which keeps the previous year's
 * answer while a newly picked year loads, and after it fails. So for as long
 * as the new year's request was in flight (or forever, on a failure) the old
 * year's revenue, deductions and W-2 figures sat under the new year. These
 * specs hold the new year's response open to check the in-between state, then
 * fail it to check the error.
 */
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { EMPTY_SUMMARY } from "./fixtures/mockDashboard";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import type { TaxSummaryResponse } from "@mybookkeeper/api-client/types/summary/TaxSummaryResponse";

const CURRENT_YEAR = new Date().getFullYear();
/** The Tax Report opens on last year. */
const TAX_SHOWN_YEAR = CURRENT_YEAR - 1;
const TAX_PICKED_YEAR = CURRENT_YEAR - 2;

const TAX_ERROR = `I couldn't load your ${TAX_PICKED_YEAR} tax summary. Want me to try again?`;
const TOTALS_ERROR = "I couldn't load your totals for this selection. Want me to try again?";

function taxSummary(year: number, grossRevenue: number): TaxSummaryResponse {
  return {
    year,
    gross_revenue: grossRevenue,
    total_deductions: 1000,
    net_taxable_income: grossRevenue - 1000,
    by_category: { repairs: 1000 },
    by_property: [],
    w2_income: [],
    w2_total: 0,
    total_income: grossRevenue - 1000,
  };
}

function summaryWithRevenue(year: number, revenue: number): SummaryResponse {
  return {
    ...EMPTY_SUMMARY,
    // Expenses keep the three cards' amounts distinct, so revenue is unambiguous.
    revenue,
    expenses: 1000,
    profit: revenue - 1000,
    by_month: [{ month: `${year}-01`, revenue, expenses: 1000, profit: revenue - 1000 }],
  };
}

/**
 * Answers ``shown`` for the year that opens, and holds every request for the
 * picked year until the returned function says how to answer it.
 */
function holdPickedYear(isPicked: (route: Route) => boolean, shown: unknown) {
  let answerPicked!: (respond: (route: Route) => Promise<void>) => void;
  const pickedAnswer = new Promise<(route: Route) => Promise<void>>((resolve) => {
    answerPicked = resolve;
  });
  const handler = async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!isPicked(route)) return route.fulfill(json(shown));
    const respond = await pickedAnswer;
    return respond(route);
  };
  return { handler, answerPicked };
}

function retryNextTo(page: Page, message: string, name: "Retry" | "Retrying...") {
  return page.getByText(message).locator("..").getByRole("button", { name, exact: true });
}

test.describe("Tax Report", () => {
  async function openTaxReport(page: Page) {
    await plantAuth(page);
    await stubUnmatchedApi(page, { answer: "empty" });
    await stubWorkspaceShell(page, "admin");
    const held = holdPickedYear(
      (route) => new URL(route.request().url()).searchParams.get("year") === String(TAX_PICKED_YEAR),
      taxSummary(TAX_SHOWN_YEAR, 24000),
    );
    await page.route(/\/api\/summary\/tax(\?|$)/, held.handler);
    await page.goto("/tax");
    await expect(page.getByText("$24,000.00")).toBeVisible();
    return held;
  }

  test("a newly picked year shows the skeleton, then its own figures, never the previous year's", async ({ page }) => {
    const { answerPicked } = await openTaxReport(page);

    await page.getByRole("combobox").selectOption(String(TAX_PICKED_YEAR));

    await expect(page.getByTestId("tax-report-skeleton")).toBeVisible();
    await expect(page.getByText("$24,000.00")).toHaveCount(0);

    answerPicked((route) => route.fulfill(json(taxSummary(TAX_PICKED_YEAR, 11000))));
    await expect(page.getByText("$11,000.00")).toBeVisible();
    await expect(page.getByText("$24,000.00")).toHaveCount(0);
  });

  test("a newly picked year that fails shows an error with Retry, not the previous year's figures", async ({ page }) => {
    const { answerPicked } = await openTaxReport(page);

    await page.getByRole("combobox").selectOption(String(TAX_PICKED_YEAR));
    answerPicked((route) => route.fulfill(json({ detail: "Internal Server Error" }, 500)));

    await expect(page.getByText(TAX_ERROR)).toBeVisible();
    await expect(retryNextTo(page, TAX_ERROR, "Retry")).toBeEnabled();
    await expect(page.getByText("$24,000.00")).toHaveCount(0);
    await expect(page.getByText("Rental Revenue")).toHaveCount(0);
  });
});

test.describe("Dashboard", () => {
  async function openDashboard(page: Page) {
    await plantAuth(page);
    await stubUnmatchedApi(page, { answer: "empty" });
    await stubWorkspaceShell(page, "admin");
    await page.route(/\/api\/summary\/years(\?|$)/, (route) =>
      route.fulfill(json([CURRENT_YEAR, CURRENT_YEAR - 1])),
    );
    const held = holdPickedYear(
      (route) =>
        new URL(route.request().url()).searchParams.get("start_date") === `${CURRENT_YEAR - 1}-01-01`,
      summaryWithRevenue(CURRENT_YEAR, 5000),
    );
    await page.route(/\/api\/summary\?/, held.handler);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-summary-cards").getByText("$5,000.00")).toBeVisible();
    return held;
  }

  test("a newly picked year shows the skeleton, then its own totals, never the previous year's", async ({ page }) => {
    const { answerPicked } = await openDashboard(page);

    await page.getByTestId("year-filter").selectOption(String(CURRENT_YEAR - 1));

    await expect(page.getByTestId("dashboard-skeleton")).toBeVisible();
    await expect(page.getByTestId("dashboard-summary-cards")).toHaveCount(0);

    answerPicked((route) => route.fulfill(json(summaryWithRevenue(CURRENT_YEAR - 1, 7000))));
    await expect(page.getByTestId("dashboard-summary-cards").getByText("$7,000.00")).toBeVisible();
    await expect(page.getByText("$5,000.00")).toHaveCount(0);
  });

  test("a newly picked year that fails shows an error with Retry and keeps the year filter", async ({ page }) => {
    const { answerPicked } = await openDashboard(page);

    await page.getByTestId("year-filter").selectOption(String(CURRENT_YEAR - 1));
    answerPicked((route) => route.fulfill(json({ detail: "Internal Server Error" }, 500)));

    await expect(page.getByText(TOTALS_ERROR)).toBeVisible();
    await expect(retryNextTo(page, TOTALS_ERROR, "Retry")).toBeEnabled();
    await expect(page.getByTestId("dashboard-summary-cards")).toHaveCount(0);
    await expect(page.getByText("$5,000.00")).toHaveCount(0);
    await expect(page.getByTestId("year-filter")).toHaveValue(String(CURRENT_YEAR - 1));
  });
});
