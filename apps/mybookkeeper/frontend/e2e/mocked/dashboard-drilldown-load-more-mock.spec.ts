/**
 * No-backend E2E for a dashboard drill-down with more rows than one page.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * The drill-down used to load up to 5,000 rows and add them up in the browser, so a
 * bigger category was cut short. It now pages GET /transactions/page by offset: its
 * headline is the server's count and total for every matching row from the first page
 * on, and "Load more" brings the next page in under the rows already shown.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { EMPTY_SUMMARY } from "./fixtures/mockDashboard";

/** More rows than two pages hold, so the last needs a third request. */
const ROW_COUNT = DRILL_DOWN_PAGE_SIZE * 2 + 5;
const AMOUNT_TOTAL = "20500.00";
const HEADLINE = `${ROW_COUNT} transactions — $20,500.00`;

const SUMMARY: SummaryResponse = { ...EMPTY_SUMMARY, expenses: 20500, profit: -20500, by_category: { maintenance: 20500 } };

function aRow(index: number) {
  return {
    id: `txn-${index}`,
    property_id: null,
    property_splits: [],
    transaction_date: "2026-03-15",
    vendor: `Plumber ${index}`,
    description: null,
    amount: "100.00",
    transaction_type: "expense",
    category: "maintenance",
    status: "approved",
    source_document_id: null,
    linked_document_ids: [],
    tags: ["maintenance"],
  };
}

/** Answers GET /transactions/page a page at a time from ROW_COUNT rows, with the total of all of them. Returns the offsets asked for. */
async function stubDrillDownPages(page: Page): Promise<number[]> {
  const offsets: number[] = [];
  const rows = Array.from({ length: ROW_COUNT }, (_, i) => aRow(i));
  await page.route(/\/api\/transactions\/page(\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    offsets.push(offset);
    const items = rows.slice(offset, offset + Number(params.get("limit")));
    return route.fulfill(json({ items, total: ROW_COUNT, has_more: offset + items.length < ROW_COUNT, amount_total: AMOUNT_TOTAL }));
  });
  return offsets;
}

test("drill-down shows the server's total for every row and loads the rest a page at a time", async ({ page }) => {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(/\/api\/summary(\?|$)/, (route) => route.fulfill(json(SUMMARY)));
  const offsets = await stubDrillDownPages(page);

  await page.goto("/");
  await page.locator(".recharts-bar-rectangle").first().click();
  const panel = page.getByRole("dialog");

  await expect(panel.getByText("Plumber 0", { exact: true })).toBeVisible();
  await expect(panel.getByText(HEADLINE)).toBeVisible();
  await expect(panel.locator("ul li")).toHaveCount(DRILL_DOWN_PAGE_SIZE);

  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByText(`Plumber ${DRILL_DOWN_PAGE_SIZE + 1}`, { exact: true })).toBeVisible();
  await expect(panel.getByText(HEADLINE)).toBeVisible();

  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByText(`Plumber ${ROW_COUNT - 1}`, { exact: true })).toBeVisible();
  await expect(panel.locator("ul li")).toHaveCount(ROW_COUNT);
  await expect(panel.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(offsets).toEqual([0, DRILL_DOWN_PAGE_SIZE, DRILL_DOWN_PAGE_SIZE * 2]);
});
