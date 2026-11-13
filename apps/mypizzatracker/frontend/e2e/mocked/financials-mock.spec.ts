/**
 * No-backend E2E for /financials: today's active drop (or, with none, the
 * newest-dated drop) is picked and its summary and expenses load, a failed
 * load offers a retry, and adding an expense sends it and the totals take it
 * in. The page picks "today" by the clock, so each test pins it.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { toast } from "@platform/ui/test-support/toast";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { FIXTURE_NOW, ON_DROP_DATE } from "./constants/fixtureTimes";
import { ACTIVE_DROP_ID, PLANNING_DROP_ID } from "./fixtures/dropFixtures";
import { failReads } from "@platform/ui/test-support/routeControls";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { stubFinancialsApi } from "./fixtures/stubFinancialsApi";
import { stubSignedInShellAt } from "./fixtures/stubSignedInShellAt";

const FINANCIALS_READ = apiPath(/^\/financials\/drops\/[^/]+$/);

function summary(page: Page, dropName = "Friday Night Drop") {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: dropName }) });
}

function expenses(page: Page) {
  return page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Expenses" }) });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(ON_DROP_DATE);
  await stubSignedInShellAt(page, ON_DROP_DATE);
  await stubDropsApi(page);
});

test("on the active drop's day, shows its totals and expenses over the newer-dated drop, and keeps the choice in the URL", async ({ page }) => {
  await stubFinancialsApi(page);

  await page.goto("/financials");
  await expect(page).toHaveURL(new RegExp(`/financials\\?drop_id=${ACTIVE_DROP_ID}$`));
  await expect(page.getByRole("heading", { name: "Financials", level: 1 })).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Select drop" });
  await expect(picker.getByRole("option")).toHaveText([
    "Holiday Drop — 2026-12-24 (planning)",
    "Friday Night Drop — 2026-11-14 (active)",
    "Opening Night — 2026-10-31 (closed)",
  ]);
  await expect(picker).toHaveValue(ACTIVE_DROP_ID);
  await expect(summary(page).getByText("Healthy", { exact: true })).toBeVisible();
  await expect(summary(page).locator("dl")).toContainText("Pizza count9Revenue$120.00");
  await expect(summary(page).locator("dl")).toContainText("Expenses-$42.00Profit$93.00");
  await expect(expenses(page).getByRole("listitem")).toHaveCount(1);
  await expect(expenses(page).getByRole("listitem")).toContainText("Costco");
});

test("with no drop running today, shows the newest-dated drop", async ({ page }) => {
  await page.clock.setFixedTime(FIXTURE_NOW);
  await stubFinancialsApi(page);

  await page.goto("/financials");
  await expect(page).toHaveURL(new RegExp(`/financials\\?drop_id=${PLANNING_DROP_ID}$`));
  await expect(page.getByRole("combobox", { name: "Select drop" })).toHaveValue(PLANNING_DROP_ID);
  await expect(summary(page, "Holiday Drop").locator("dl")).toContainText("Pizza count0Revenue$0.00");
  await expect(expenses(page).getByRole("listitem")).toHaveCount(0);
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
