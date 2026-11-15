/**
 * No-backend E2E for the dashboard drill-down when its transactions fail to load.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * The drill-down used to read a failed request as an empty category and headline
 * "0 transactions — $0", which looks like a real answer. It must say it couldn't
 * load, hold that message through a Retry, and bring the rows back once the
 * request recovers.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";
import { EMPTY_SUMMARY } from "./fixtures/mockDashboard";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";

const LOAD_ERROR = "Couldn't load these transactions.";
const ZERO_HEADLINE = /0 transactions — \$0/;

const SUMMARY: SummaryResponse = { ...EMPTY_SUMMARY, expenses: 500, profit: -500, by_category: { maintenance: 500 } };

async function openMaintenanceDrillDown(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(".recharts-bar-rectangle").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function stubDashboard(page: Page): Promise<void> {
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(/\/api\/summary(\?|$)/, (route) => route.fulfill(json(SUMMARY)));
}

test("drill-down says it couldn't load instead of showing 0 transactions and $0", async ({ page }) => {
  await plantAuth(page);
  await stubDashboard(page);
  await failUntilRecovered(page, /\/api\/transactions(\?|$)/, []);

  await openMaintenanceDrillDown(page);

  const panel = page.getByRole("dialog");
  await expect(panel.getByText(LOAD_ERROR)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(panel.getByText(ZERO_HEADLINE)).toHaveCount(0);
  await expect(panel.getByText("No transactions found for this period.")).toHaveCount(0);
});

test("drill-down Retry holds the error while it runs, then shows the empty result once it recovers", async ({ page }) => {
  await plantAuth(page);
  await stubDashboard(page);
  const transactions = await failUntilRecovered(page, /\/api\/transactions(\?|$)/, []);

  await openMaintenanceDrillDown(page);
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(LOAD_ERROR)).toBeVisible();

  transactions.recover();
  const before = transactions.loads();
  await panel.getByRole("button", { name: "Retry", exact: true }).click();

  // In flight: still the error, with the retry visibly running.
  await expect(panel.getByRole("button", { name: "Retrying...", exact: true })).toBeDisabled();
  await expect(panel.getByText(ZERO_HEADLINE)).toHaveCount(0);
  await expect.poll(transactions.loads).toBeGreaterThan(before);

  transactions.release();
  await expect(panel.getByText("No transactions found for this period.")).toBeVisible();
  await expect(panel.getByText(LOAD_ERROR)).toHaveCount(0);
});
