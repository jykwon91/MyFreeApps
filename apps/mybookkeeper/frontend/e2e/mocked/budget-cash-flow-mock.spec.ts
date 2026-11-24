/**
 * No-backend E2E for /budget and /cash-flow.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - both pages are reachable from the nav, after Net Worth;
 *   - a month shows each category against its budget, an over-budget category
 *     flagged, refunds named, uncategorized spending listed, and the totals;
 *   - the month arrows ask for the next month and keep it in the URL;
 *   - typing a budget sends cents from the month on screen, toasts, and the
 *     page refetches the new figures;
 *   - with no categories it invites adding one;
 *   - both skeletons have their loaded page's shape;
 *   - the cash flow chart draws, and the scope, range and account pickers ask
 *     the server for what was picked and keep it in the URL;
 *   - on a phone neither page scrolls sideways.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const GROCERIES = "11111111-1111-1111-1111-111111111111";
const DINING = "22222222-2222-2222-2222-222222222222";
const CHECKING = "44444444-4444-4444-4444-444444444444";

function budgetLine(id: string, name: string, budgetCents: number | null, spentCents: number, refundedCents = 0) {
  const remaining = budgetCents === null ? null : budgetCents - spentCents;
  return {
    spending_category_id: id, name, is_archived: false,
    budget_cents: budgetCents, budget_effective_month: budgetCents === null ? null : "2026-09",
    spent_cents: spentCents, refunded_cents: refundedCents, remaining_cents: remaining,
    percent_used: budgetCents === null || budgetCents === 0 ? null : Math.round((spentCents * 100) / budgetCents),
    is_over_budget: remaining !== null && remaining < 0,
  };
}

function budgetMonth(month: string, groceriesCents: number | null, empty: boolean) {
  if (empty) {
    return {
      month, currency: "USD", lines: [], uncategorized_spent_cents: 0,
      totals: { budgeted_cents: null, spent_cents: 0, remaining_cents: null, percent_used: null, is_over_budget: false },
    };
  }
  const lines = [budgetLine(GROCERIES, "Groceries", groceriesCents, 21_950), budgetLine(DINING, "Dining", 10_000, 10_150, 3_050)];
  const budgeted = (groceriesCents ?? 0) + 10_000;
  const spent = 21_950 + 10_150 + 4_200;
  return {
    month, currency: "USD", lines, uncategorized_spent_cents: 4_200,
    totals: {
      budgeted_cents: budgeted, spent_cents: spent, remaining_cents: budgeted - spent,
      percent_used: Math.round((spent * 100) / budgeted), is_over_budget: spent > budgeted,
    },
  };
}

function cashFlow(range: string, scope: string, accountId: string | null) {
  const months = [
    { month: "2026-10", money_in_cents: 500_000, money_out_cents: 320_000, net_cents: 180_000 },
    { month: "2026-11", money_in_cents: 410_000, money_out_cents: 450_000, net_cents: -40_000 },
  ];
  return {
    range, scope, account_id: accountId, currency: "USD", months,
    totals: { money_in_cents: 910_000, money_out_cents: 770_000, net_cents: 140_000 },
  };
}

interface FakeServer {
  months: string[];
  saves: unknown[];
  cashFlowQueries: string[];
}

async function stubApi(page: Page, { empty = false, hold = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { months: [], saves: [], cashFlowQueries: [] };
  let groceriesCents: number | null = null;
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/financial-accounts**", (route) =>
    route.fulfill(json({ items: [{ id: CHECKING, name: "Chase Checking" }], totals: [] })),
  );
  await page.route(/\/api\/budgets(\?.*)?$/, async (route, request: Request) => {
    if (hold) return; // never answered: the page stays loading
    const month = new URL(request.url()).searchParams.get("month") ?? "";
    server.months.push(month);
    await route.fulfill(json(budgetMonth(month, groceriesCents, empty)));
  });
  await page.route(/\/api\/budgets\/[^/?]+$/, async (route, request: Request) => {
    const body = request.postDataJSON() as { effective_month: string; amount_cents: number | null };
    server.saves.push(body);
    groceriesCents = body.amount_cents;
    await route.fulfill(json({ spending_category_id: GROCERIES, ...body }));
  });
  await page.route(/\/api\/cash-flow(\?.*)?$/, async (route, request: Request) => {
    if (hold) return;
    const params = new URL(request.url()).searchParams;
    server.cashFlowQueries.push(params.toString());
    await route.fulfill(json(cashFlow(params.get("range") ?? "6m", params.get("scope") ?? "all", params.get("account_id"))));
  });
  return server;
}

async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Budget", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and shows each category against its budget", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Budget" }).first().click();
    await expect(page).toHaveURL(/\/budget$/);
    await page.goto("/budget?month=2026-11");

    await expect(page.getByTestId("budget-month-label")).toHaveText("November 2026");
    await expect(page.getByTestId("budget-total-spent")).toContainText("$363.00");
    const dining = page.getByTestId(`budget-line-${DINING}`);
    await expect(dining.getByTestId("budget-line-status")).toContainText("$1.50 over budget");
    await expect(dining.getByTestId("budget-line-status")).toContainText("includes $30.50 refunded");
    await expect(dining.getByTestId("budget-progress")).toHaveAttribute("data-over", "true");
    await expect(page.getByTestId(`budget-line-${GROCERIES}`)).toContainText("No budget");
    await expect(page.getByTestId("budget-uncategorized-amount")).toContainText("$42.00 spent");
  });

  test("the month arrows ask for the next month and keep it in the URL", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/budget?month=2026-12");
    await expect(page.getByTestId("budget-lines")).toBeVisible();
    await page.getByTestId("budget-month-next").click();
    await expect(page).toHaveURL(/\?month=2027-01$/);
    await expect(page.getByTestId("budget-month-label")).toHaveText("January 2027");
    await expect.poll(() => server.months).toEqual(["2026-12", "2027-01"]);
  });

  test("a budget is typed in place, saved from this month onward, and counted", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/budget?month=2026-11");

    const groceries = page.getByTestId(`budget-line-${GROCERIES}`);
    await groceries.getByTestId("budget-edit").click();
    await expect(groceries.getByTestId("budget-hint")).toContainText("Applies from November 2026 onward");
    await groceries.getByTestId("budget-input").fill("400");
    await groceries.getByTestId("budget-save").click();

    await expect(toast(page, "Budget saved.")).toBeVisible();
    expect(server.saves).toEqual([{ effective_month: "2026-11", amount_cents: 40_000 }]);
    await expect(groceries.getByTestId("budget-line-amount")).toContainText("$219.50 of $400.00");
    await expect(groceries.getByTestId("budget-line-status")).toContainText("$180.50 left");
    await expect(page.getByTestId("budget-total-budgeted")).toContainText("$500.00");
  });

  test("with no categories it invites adding one", async ({ page }) => {
    await stubApi(page, { empty: true });
    await page.goto("/budget?month=2026-11");
    await page.getByRole("button", { name: "Add a category" }).click();
    await expect(page).toHaveURL(/\/spending-categories$/);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/budget?month=2026-11");
    await expect(page.getByTestId("budget-skeleton")).toBeVisible();
    await expect(page.getByTestId("budget-skeleton-tile")).toHaveCount(3);
    await expect(page.getByTestId("budget-skeleton-row")).not.toHaveCount(0);
  });

  test("fits a phone screen, with the budget editor open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/budget?month=2026-11");
    await page.getByTestId(`budget-line-${DINING}`).getByTestId("budget-edit").click();
    await expect(page.getByTestId("budget-input")).toBeVisible();
    await expectNoSideScroll(page);
  });
});

test.describe("Cash flow", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and charts money in and out per month", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Cash Flow" }).first().click();
    await expect(page).toHaveURL(/\/cash-flow$/);
    await expect(page.getByTestId("cash-flow-chart")).toBeVisible();
    await expect(page.getByTestId("cash-flow-total-in")).toContainText("$9,100.00");
    await expect(page.getByTestId("cash-flow-total-out")).toContainText("$7,700.00");
    await expect(page.getByTestId("cash-flow-total-net")).toContainText("$1,400.00");
    expect(server.cashFlowQueries).toEqual(["range=6m&scope=all"]);
  });

  test("the scope, range and account pickers ask for what was picked", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/cash-flow");
    await expect(page.getByTestId("cash-flow-chart")).toBeVisible();

    await page.getByTestId("cash-flow-scope-personal").click();
    await expect(page.getByTestId("cash-flow-scope-personal")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("cash-flow-range-ytd").click();
    await page.getByTestId("cash-flow-account").selectOption(CHECKING);

    await expect(page).toHaveURL(new RegExp(`range=ytd&scope=personal&account=${CHECKING}$`));
    await expect.poll(() => server.cashFlowQueries.at(-1)).toBe(`range=ytd&scope=personal&account_id=${CHECKING}`);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/cash-flow");
    await expect(page.getByTestId("cash-flow-skeleton")).toBeVisible();
    await expect(page.getByTestId("cash-flow-skeleton-tile")).toHaveCount(3);
    await expect(page.getByTestId("cash-flow-skeleton-chart")).toHaveCount(1);
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/cash-flow");
    await expect(page.getByTestId("cash-flow-chart")).toBeVisible();
    await expectNoSideScroll(page);
  });
});
