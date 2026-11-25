/**
 * No-backend E2E for /monthly-expenses.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - the page is reachable from the nav and shows the average month, the
 *     total, the breakdown largest first and each month;
 *   - the range and scope pickers ask the server for what was picked and keep
 *     it in the URL;
 *   - opening a heading asks for that heading over the same months and money,
 *     lists who got how much and each payment (date, payee, account, amount),
 *     a page at a time with "Show more";
 *   - both the page's and an opened heading's skeletons have their loaded shape;
 *   - the page uses the full width on a desktop and never scrolls sideways on
 *     a phone, with a heading open.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { DESKTOP_VIEWPORT, expectFullWidthPage } from "./fixtures/fullWidthPage";

const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const PAYMENTS_PAGE = 10;

function summary(range: string, scope: string) {
  const months = MONTHS.map((month) => ({ month, total_cents: 1_746_700 }));
  return {
    range, scope, currency: "USD", months,
    total_cents: 10_480_200, average_cents: 1_746_700,
    categories: [
      { label: "Mortgage", total_cents: 6_000_000, average_cents: 1_000_000, share_percent: 57.3 },
      { label: "Utilities & phone", total_cents: 360_000, average_cents: 60_000, share_percent: 3.4 },
      { label: "Money sent to people", total_cents: 240_000, average_cents: 40_000, share_percent: 2.3 },
    ],
  };
}

function utilityPayment(i: number) {
  const zelle = i % 3 === 0;
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    date: `2026-10-${String(28 - i).padStart(2, "0")}`,
    payee: zelle ? "Silvia" : "Constellation Energy",
    description: zelle ? "Zelle payment to Silvia" : null,
    account_name: "Checking", account_institution: "TDECU", account_mask: "4821",
    amount_cents: 30_000,
  };
}

const UTILITY_PAYMENTS = Array.from({ length: 12 }, (_, i) => utilityPayment(i));

function utilities(range: string, scope: string) {
  return {
    range, scope, label: "Utilities & phone", currency: "USD", total_cents: 360_000,
    payees: [
      { payee: "Constellation Energy", total_cents: 240_000, transaction_count: 8 },
      { payee: "Silvia", total_cents: 120_000, transaction_count: 4 },
    ],
    transactions: UTILITY_PAYMENTS,
  };
}

interface FakeServer {
  summaryQueries: string[];
  categoryQueries: string[];
}

async function stubApi(page: Page, { hold = false, holdDetail = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { summaryQueries: [], categoryQueries: [] };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/monthly-expenses(\?.*)?$/, async (route, request: Request) => {
    if (hold) return; // never answered: the page stays loading
    const params = new URL(request.url()).searchParams;
    server.summaryQueries.push(params.toString());
    await route.fulfill(json(summary(params.get("range") ?? "6m", params.get("scope") ?? "all")));
  });
  await page.route(/\/api\/monthly-expenses\/category(\?.*)?$/, async (route, request: Request) => {
    if (holdDetail) return;
    const params = new URL(request.url()).searchParams;
    server.categoryQueries.push(params.toString());
    await route.fulfill(json(utilities(params.get("range") ?? "6m", params.get("scope") ?? "all")));
  });
  return server;
}

async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

function utilitiesRow(page: Page) {
  return page.getByTestId("monthly-expense-category").filter({ hasText: "Utilities & phone" });
}

test.describe("Monthly expenses", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and shows the average month and where it goes", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Monthly Expenses" }).first().click();
    await expect(page).toHaveURL(/\/monthly-expenses$/);
    await expect(page.getByTestId("monthly-expenses-average")).toContainText("$17,467.00");
    await expect(page.getByTestId("monthly-expenses-total")).toContainText("Total over 6 months");
    await expect(page.getByTestId("monthly-expenses-total")).toContainText("$104,802.00");
    await expect(page.getByTestId("monthly-expense-category-label")).toHaveText(
      ["Mortgage", "Utilities & phone", "Money sent to people"],
    );
    await expect(page.getByTestId("monthly-expense-category").first()).toContainText("57.3% of spending");
    await expect(page.getByTestId("monthly-expenses-month")).toHaveCount(6);
    await expect(page.getByTestId("monthly-expenses-month").first()).toContainText("May 2026");
    expect(server.summaryQueries).toEqual(["range=6m&scope=all"]);
  });

  test("the range and scope pickers ask for what was picked", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/monthly-expenses");
    await expect(page.getByTestId("monthly-expenses-average")).toBeVisible();

    await page.getByTestId("monthly-expenses-range-12m").click();
    await expect(page.getByTestId("monthly-expenses-range-12m")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("monthly-expenses-scope-rental").click();

    await expect(page).toHaveURL(/range=12m&scope=rental$/);
    await expect.poll(() => server.summaryQueries.at(-1)).toBe("range=12m&scope=rental");
  });

  test("a heading opens to who got how much and each payment", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/monthly-expenses?range=3m&scope=personal");
    const row = utilitiesRow(page);
    const toggle = row.getByTestId("monthly-expense-category-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(server.categoryQueries).toEqual(["range=3m&scope=personal&category=Utilities+%26+phone"]);

    await expect(row.getByTestId("monthly-expense-payee-name")).toHaveText(["Constellation Energy", "Silvia"]);
    await expect(row.getByTestId("monthly-expense-payee-total")).toHaveText(["$2,400.00", "$1,200.00"]);
    await expect(row.getByTestId("monthly-expense-payee").first()).toContainText("8 payments");

    const payments = row.getByTestId("monthly-expense-transaction");
    await expect(payments).toHaveCount(PAYMENTS_PAGE);
    await expect(payments.first().getByTestId("monthly-expense-transaction-payee")).toHaveText("Silvia");
    await expect(payments.first().getByTestId("monthly-expense-transaction-date")).toHaveText("Oct 28, 2026");
    await expect(payments.first().getByTestId("monthly-expense-transaction-account")).toHaveText("Checking ··4821 · TDECU");
    await expect(payments.first().getByTestId("monthly-expense-transaction-amount")).toHaveText("$300.00");
    await expect(payments.first()).toContainText("Zelle payment to Silvia");

    await row.getByTestId("monthly-expense-transactions-more").click();
    await expect(payments).toHaveCount(UTILITY_PAYMENTS.length);
    await expect(row.getByTestId("monthly-expense-transactions-more")).toHaveCount(0);

    await toggle.click();
    await expect(row.getByTestId("monthly-expense-detail")).toHaveCount(0);
  });

  test("the skeletons have their loaded shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/monthly-expenses?range=3m");
    await expect(page.getByTestId("monthly-expenses-skeleton")).toBeVisible();
    await expect(page.getByTestId("monthly-expenses-skeleton-tile")).toHaveCount(2);
    await expect(page.getByTestId("monthly-expenses-skeleton-category")).not.toHaveCount(0);
    await expect(page.getByTestId("monthly-expenses-skeleton-month")).toHaveCount(3);
  });

  test("an opened heading shows a skeleton while its payments load", async ({ page }) => {
    await stubApi(page, { holdDetail: true });
    await page.goto("/monthly-expenses");
    await utilitiesRow(page).getByTestId("monthly-expense-category-toggle").click();
    await expect(page.getByTestId("monthly-expense-detail-skeleton")).toBeVisible();
    await expect(page.getByTestId("monthly-expense-detail-skeleton-payee")).not.toHaveCount(0);
    await expect(page.getByTestId("monthly-expense-detail-skeleton-payment")).not.toHaveCount(0);
  });

  test("uses the full width on a desktop screen", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await stubApi(page);
    await page.goto("/monthly-expenses");
    await expect(page.getByTestId("monthly-expenses-average")).toBeVisible();
    await expectFullWidthPage(page);
  });

  test("fits a phone screen, with a heading open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/monthly-expenses");
    await utilitiesRow(page).getByTestId("monthly-expense-category-toggle").click();
    await expect(page.getByTestId("monthly-expense-transaction")).toHaveCount(PAYMENTS_PAGE);
    await expectNoSideScroll(page);
  });
});
