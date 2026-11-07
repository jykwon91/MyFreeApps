import { expect, type Locator, type Page } from "@playwright/test";
import type { DashboardTotals } from "./dashboard-totals";

/** The card a heading titles. */
export function card(page: Page, title: string): Locator {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

/** The chart inside a titled card. */
export function chartIn(page: Page, title: string): Locator {
  return card(page, title).locator(".recharts-wrapper");
}

/** A chart's bars for one series (Recharts names each bar after it), in data order. */
export function bars(chart: Locator, series: string): Locator {
  return chart.locator(`path.recharts-rectangle[name="${series}"]`);
}

/** The x-axis label for a month, e.g. "Jan 26". */
export function monthLabel(chart: Locator, month: string): Locator {
  return chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-label").filter({ hasText: month });
}

/** Drags across a chart from one month's label to another's, as a user picks a range. */
export async function dragAcrossMonths(page: Page, chart: Locator, from: string, to: string): Promise<void> {
  await chart.scrollIntoViewIfNeeded();
  const start = (await monthLabel(chart, from).boundingBox())!;
  const end = (await monthLabel(chart, to).boundingBox())!;
  const plot = (await chart.locator(":scope > svg").boundingBox())!;
  const y = plot.y + plot.height / 2;
  await page.mouse.move(start.x + start.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, y, { steps: 5 });
  await page.mouse.up();
}

/** The chart's legend entries, in order. */
export function legend(chart: Locator): Locator {
  return chart.locator(".recharts-legend-item-text");
}

/** Exact amounts: each SummaryCard is a label <p> then an amount <p>. */
export async function expectSummaryCards(page: Page, totals: DashboardTotals): Promise<void> {
  const cards = page.getByTestId("dashboard-summary-cards").locator(":scope > *");
  await expect(cards.filter({ hasText: "Total Revenue" }).locator("p").nth(1)).toHaveText(totals.revenue);
  await expect(cards.filter({ hasText: "Total Expenses" }).locator("p").nth(1)).toHaveText(totals.expenses);
  await expect(cards.filter({ hasText: "Net Profit" }).locator("p").nth(1)).toHaveText(totals.profit);
}

/** Opens the dashboard and waits for its summary cards. */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("dashboard-summary-cards")).toBeVisible({ timeout: 15000 });
}
