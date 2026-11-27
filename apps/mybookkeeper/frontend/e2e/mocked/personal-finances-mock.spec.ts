/**
 * No-backend E2E for /personal-finances.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - the page is in the nav's Money section and shows the totals, the net in
 *     red when below zero, the monthly average with the typical month, where
 *     income came from, where it went, and the one-offs;
 *   - picking a year asks the server for that year and keeps it in the URL;
 *     All time asks for the whole history;
 *   - dragging across the chart asks for just those months, and the reset goes
 *     back to the whole year;
 *   - with no bank connected it says so and links to Financial Accounts;
 *   - the skeleton has the loaded page's shape;
 *   - it uses the full width on a desktop and fits a phone.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { DESKTOP_VIEWPORT, expectFullWidthPage } from "./fixtures/fullWidthPage";

const HISTORY = ["2026-08", "2026-09", "2026-10", "2026-11"];

function month(m: string, incomeCents: number, expensesCents: number, loansCents: number) {
  return { month: m, income_cents: incomeCents, expenses_cents: expensesCents, mortgages_loans_cents: loansCents, net_cents: incomeCents - expensesCents };
}

const MONTHS = {
  "2026-08": month("2026-08", 700_000, 600_000, 341_396),
  "2026-09": month("2026-09", 700_000, 650_000, 341_396),
  "2026-10": month("2026-10", 2_527_900, 640_000, 341_396),
  "2026-11": month("2026-11", 100_000, 400_000, 341_396),
} as const;

function personalFinances(start: string | null, end: string | null, noBank: boolean) {
  const empty = { income_cents: 0, expenses_cents: 0, mortgages_loans_cents: 0, net_cents: 0 };
  if (noBank) {
    return {
      currency: "USD", bank_history_start: null, start: null, end: null, years: [], months: [], totals: empty,
      income_split: { salary_cents: 0, rental_net_cents: 0, other_cents: 0 }, by_category: [], one_offs: [],
      average: { months: 0, income_cents: 0, expenses_cents: 0, net_cents: 0, typical_income_cents: 0, typical_net_cents: 0 },
    };
  }
  const first = start === null || start < HISTORY[0] ? HISTORY[0] : start;
  const last = end === null || end > HISTORY[HISTORY.length - 1] ? HISTORY[HISTORY.length - 1] : end;
  const months = HISTORY.filter((m) => m >= first && m <= last).map((m) => MONTHS[m as keyof typeof MONTHS]);
  const sum = (key: "income_cents" | "expenses_cents" | "mortgages_loans_cents" | "net_cents") =>
    months.reduce((total, m) => total + m[key], 0);
  const hasOneOff = months.some((m) => m.month === "2026-10");
  return {
    currency: "USD", bank_history_start: "2026-08-01", start: first, end: last, years: [2026],
    months,
    totals: { income_cents: sum("income_cents"), expenses_cents: sum("expenses_cents"), mortgages_loans_cents: sum("mortgages_loans_cents"), net_cents: sum("net_cents") },
    income_split: { salary_cents: 1_000_000, rental_net_cents: 370_000, other_cents: sum("income_cents") - 1_370_000 },
    by_category: [{ label: "Mortgage", cents: sum("mortgages_loans_cents") }, { label: "Groceries", cents: 120_000 }],
    one_offs: hasOneOff ? [{ transaction_id: "t-1", date: "2026-10-20", payee: "Schwab beneficiary", amount_cents: 1_827_900 }] : [],
    average: {
      months: 3, income_cents: 1_309_300, expenses_cents: 630_000, net_cents: 679_300,
      typical_income_cents: hasOneOff ? 700_000 : 1_309_300, typical_net_cents: hasOneOff ? 70_000 : 679_300,
    },
  };
}

interface FakeServer {
  queries: string[];
}

async function stubApi(page: Page, { noBank = false, hold = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { queries: [] };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/personal-finances(\?.*)?$/, async (route, request: Request) => {
    if (hold) return; // never answered: the page stays loading
    const params = new URL(request.url()).searchParams;
    server.queries.push(params.toString());
    await route.fulfill(json(personalFinances(params.get("start"), params.get("end"), noBank)));
  });
  return server;
}

async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Personal finances", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and shows the totals, where income came from and where it went", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Personal Finances" }).first().click();
    await expect(page).toHaveURL(/\/personal-finances$/);

    await expect(page.getByTestId("personal-finances-chart")).toBeVisible();
    await expect(page.getByTestId("personal-finances-income")).toContainText("$40,279.00");
    await expect(page.getByTestId("personal-finances-expenses")).toContainText("$22,900.00");
    await expect(page.getByTestId("personal-finances-expenses")).toContainText("$13,655.84 of it mortgages & loans");
    await expect(page.getByTestId("personal-finances-net")).toContainText("$17,379.00");
    await expect(page.getByTestId("personal-finances-average")).toContainText("$6,793.00");
    await expect(page.getByTestId("personal-finances-average")).toContainText("$700.00 in a typical month, without one-offs");
    await expect(page.getByTestId("personal-finances-income-salary")).toContainText("$10,000.00");
    await expect(page.getByTestId("personal-finances-income-rental")).toContainText("$3,700.00");
    await expect(page.getByTestId("personal-finances-category").first()).toContainText("Mortgage");
    await expect(page.getByTestId("personal-finances-one-off")).toContainText("Schwab beneficiary");
    await expect(page.getByTestId("personal-finances-one-off")).toContainText("$18,279.00");
    expect(server.queries).toEqual([""]);
  });

  test("a net below zero shows in red", async ({ page }) => {
    await stubApi(page);
    await page.goto("/personal-finances?start=2026-11&end=2026-11");
    const net = page.getByTestId("personal-finances-net");
    await expect(net).toContainText("-$3,000.00");
    await expect(net.locator("p.text-red-600")).toHaveCount(1);
  });

  test("picking a year asks for that year and keeps it in the URL; All time asks for everything", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/personal-finances");
    await expect(page.getByTestId("personal-finances-chart")).toBeVisible();

    await page.getByTestId("personal-finances-year").selectOption("2026");
    await expect(page).toHaveURL(/\?start=2026-01&end=2026-12$/);
    await expect.poll(() => server.queries.at(-1)).toBe("start=2026-01&end=2026-12");

    await page.getByTestId("personal-finances-year").selectOption("all");
    await expect(page).toHaveURL(/\/personal-finances$/);
    await expect(page.getByTestId("personal-finances-chart")).toBeVisible();
  });

  test("dragging across the chart asks for just those months; the reset goes back to the year", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const server = await stubApi(page);
    await page.goto("/personal-finances?start=2026-01&end=2026-12");
    const chart = page.getByTestId("personal-finances-chart");
    await expect(chart).toBeVisible();

    const surface = chart.locator(".recharts-cartesian-grid");
    const box = await surface.boundingBox();
    expect(box, "the chart's plot area should be on screen").not.toBeNull();
    const y = box!.y + box!.height / 2;
    // Four months across the plot: from the first month's slot to the third's.
    await page.mouse.move(box!.x + box!.width * 0.125, y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.4, y, { steps: 5 });
    await page.mouse.move(box!.x + box!.width * 0.625, y, { steps: 5 });
    await page.mouse.up();

    await expect(page).toHaveURL(/\?start=2026-08&end=2026-10$/);
    await expect.poll(() => server.queries.at(-1)).toBe("start=2026-08&end=2026-10");
    await page.getByTestId("personal-finances-reset-range").click();
    await expect(page).toHaveURL(/\?start=2026-01&end=2026-12$/);
  });

  test("with no bank connected it says so and links to Financial Accounts", async ({ page }) => {
    await stubApi(page, { noBank: true });
    await page.goto("/personal-finances");
    const noBank = page.getByTestId("personal-finances-no-bank");
    await expect(noBank).toContainText("Connect a bank to see your finances");
    await expect(page.getByTestId("personal-finances-controls")).toHaveCount(0);
    await noBank.getByRole("link", { name: "Go to Financial Accounts" }).click();
    await expect(page).toHaveURL(/\/financial-accounts$/);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/personal-finances");
    await expect(page.getByTestId("personal-finances-skeleton")).toBeVisible();
    await expect(page.getByTestId("cash-basis-note-skeleton")).toHaveCount(1);
    await expect(page.getByTestId("personal-finances-skeleton-tile")).toHaveCount(4);
    await expect(page.getByTestId("personal-finances-skeleton-chart")).toHaveCount(1);
    await expect(page.getByTestId("personal-finances-skeleton-breakdown")).toHaveCount(2);
  });

  test("uses the full width on a desktop screen", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await stubApi(page);
    await page.goto("/personal-finances");
    await expect(page.getByTestId("personal-finances-chart")).toBeVisible();
    await expectFullWidthPage(page);
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/personal-finances");
    await expect(page.getByTestId("personal-finances-chart")).toBeVisible();
    await expectNoSideScroll(page);
  });
});
