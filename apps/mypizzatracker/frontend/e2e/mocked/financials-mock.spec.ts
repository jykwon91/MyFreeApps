/**
 * No-backend E2E for /financials: the most recent drop's summary and
 * expenses load, a failed load offers a retry, and adding an expense sends it and the totals take it in.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { apiPath } from "./fixtures/apiPath";
import { ACTIVE_DROP_ID } from "./fixtures/dropFixtures";
import { failReads } from "./fixtures/routeControls";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubFinancialsApi } from "./fixtures/stubFinancialsApi";

const FINANCIALS_READ = apiPath(/^\/financials\/drops\/[^/]+$/);

function summary(page: Page) {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Friday Night Drop" }) });
}

function expenses(page: Page) {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Expenses" }) });
}

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await stubDropsApi(page);
});

test("shows the most recent drop's totals and expenses, and keeps the choice in the URL", async ({ page }) => {
  await stubFinancialsApi(page);

  await page.goto("/financials");
  await expect(page).toHaveURL(new RegExp(`/financials\\?drop_id=${ACTIVE_DROP_ID}$`));
  await expect(page.getByRole("heading", { name: "Financials", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Select drop" })).toHaveValue(ACTIVE_DROP_ID);
  await expect(summary(page).getByText("Healthy", { exact: true })).toBeVisible();
  await expect(summary(page).locator("dl")).toContainText("Pizza count9Revenue$120.00");
  await expect(summary(page).locator("dl")).toContainText("Expenses-$42.00Profit$93.00");
  await expect(expenses(page).getByRole("listitem")).toHaveCount(1);
  await expect(expenses(page).getByRole("listitem")).toContainText("Costco");
});

test("adds an expense, which the totals then take in", async ({ page }) => {
  const writes = await stubFinancialsApi(page);

  await page.goto("/financials");
  await expenses(page).getByRole("button", { name: "+ Add expense" }).click();
  await page.getByRole("textbox", { name: "Vendor" }).fill(" Restaurant Depot ");
  await page.getByRole("textbox", { name: "Category" }).fill("supplies");
  await page.getByRole("spinbutton", { name: "Amount" }).fill("18.50");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();

  await expect(toast(page, "Expense added")).toBeVisible();
  await expect(expenses(page).getByRole("listitem")).toHaveCount(2);
  await expect(summary(page).locator("dl")).toContainText("Expenses-$60.50Profit$74.50");
  expect(writes).toEqual([
    {
      method: "POST",
      path: `/financials/drops/${ACTIVE_DROP_ID}/expenses`,
      body: { vendor: "Restaurant Depot", category: "supplies", amount: "18.50", description: null },
    },
  ]);
});

test("a failed load of the totals says so and Retry loads them", async ({ page }) => {
  await stubFinancialsApi(page);
  await failReads(page, FINANCIALS_READ);

  await page.goto("/financials");
  await expect(page.getByText("Failed to load financials.")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(summary(page)).toBeVisible();
  await expect(page.getByText("Failed to load financials.")).toHaveCount(0);
});
