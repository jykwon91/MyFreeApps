import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { createProperty, createTransaction, deleteProperty, deleteTransaction } from "./fixtures/seed-data";
import { cleanUp } from "./fixtures/cleanup";
import { localToday } from "./fixtures/local-today";

/**
 * Regression tests for: the Dashboard kept showing an old Summary after a
 * transaction mutation, until a full reload.
 *
 * Every transaction mutation lists "Summary" in invalidatesTags. These tests
 * run the mutation from the Transactions page and come back to the Dashboard
 * through the sidebar, so the page never reloads: only the invalidation can
 * refresh the cached summary.
 */

const RUN_ID = Date.now();

interface SeededProperty {
  id: string;
  name: string;
  transactionIds: string[];
}

async function seedProperty(api: APIRequestContext, label: string): Promise<SeededProperty> {
  const name = `E2E Summary ${label} ${RUN_ID}`;
  const property = await createProperty(api, { name });
  return { id: property.id, name, transactionIds: [] };
}

async function addIncome(
  api: APIRequestContext,
  seeded: SeededProperty,
  vendor: string,
  amount: string,
): Promise<string> {
  const tx = await createTransaction(api, {
    vendor,
    amount,
    transaction_type: "income",
    category: "rental_revenue",
    transaction_date: localToday(),
    property_id: seeded.id,
  });
  seeded.transactionIds.push(tx.id);
  return tx.id;
}

async function approve(api: APIRequestContext, ids: string[]): Promise<void> {
  const res = await api.post("/transactions/bulk-approve", { data: { ids } });
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ approved: ids.length, skipped: 0 });
}

function removeSeeded(api: APIRequestContext, seeded: SeededProperty): Promise<void> {
  return cleanUp(
    ...seeded.transactionIds.map((id) => () => deleteTransaction(api, id)),
    () => deleteProperty(api, seeded.id),
  );
}

function revenueCell(page: Page, propertyName: string): Locator {
  return page.getByRole("row").filter({ hasText: propertyName }).getByRole("cell").nth(1);
}

async function openTransaction(page: Page, vendor: string): Promise<void> {
  await page.getByRole("link", { name: "Transactions", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await page.getByPlaceholder(/filter by vendor/i).first().fill(vendor);
  await page.getByRole("row").filter({ hasText: vendor }).click();
}

async function backToDashboard(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe("Summary cache invalidation", () => {
  test("Dashboard shows a transaction approved from the Transactions page", async ({
    authedPage: page,
    api,
  }) => {
    const vendor = `E2E Pending Vendor ${RUN_ID}`;
    const seeded = await seedProperty(api, "Approve");
    try {
      await addIncome(api, seeded, `E2E Baseline Vendor ${RUN_ID}`, "250.00");
      await addIncome(api, seeded, vendor, "500.00");
      await approve(api, [seeded.transactionIds[0]]);

      await page.goto("/");
      await expect(revenueCell(page, seeded.name)).toHaveText("$250.00", { timeout: 15000 });

      await openTransaction(page, vendor);
      await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await backToDashboard(page);
      await expect(revenueCell(page, seeded.name)).toHaveText("$750.00", { timeout: 10000 });
    } finally {
      await removeSeeded(api, seeded);
    }
  });

  test("Dashboard drops a transaction deleted from the Transactions page", async ({
    authedPage: page,
    api,
  }) => {
    const vendor = `E2E Delete Vendor ${RUN_ID}`;
    const seeded = await seedProperty(api, "Delete");
    try {
      await addIncome(api, seeded, `E2E Keep Vendor ${RUN_ID}`, "250.00");
      const deletedId = await addIncome(api, seeded, vendor, "500.00");
      await approve(api, seeded.transactionIds);

      await page.goto("/");
      await expect(revenueCell(page, seeded.name)).toHaveText("$750.00", { timeout: 15000 });

      await openTransaction(page, vendor);
      await page.getByRole("button", { name: "Delete transaction" }).click();
      await expect(page.getByText(/are you sure you want to delete/i)).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByText(/are you sure you want to delete/i)).toHaveCount(0);
      await expect.poll(async () => (await api.get(`/transactions/${deletedId}`)).status()).toBe(404);
      seeded.transactionIds = seeded.transactionIds.filter((id) => id !== deletedId);

      await backToDashboard(page);
      await expect(revenueCell(page, seeded.name)).toHaveText("$250.00", { timeout: 10000 });
    } finally {
      await removeSeeded(api, seeded);
    }
  });
});
