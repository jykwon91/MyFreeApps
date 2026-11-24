/**
 * Financial accounts against the real backend, in a fresh organization of their
 * own (deleted afterwards, which takes every account and transaction with it).
 *
 * Drives what the person actually does: add a checking account on the
 * Financial Accounts page → file an existing transaction under it from the
 * Transactions panel → see the account on the row and find the row by the
 * account filter. Then: restate a balance and close an account, which takes it
 * out of the totals. Each step is checked in the UI and through the API.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { createTransaction, deleteTransaction } from "./fixtures/seed-data";

const org = seededOrg("financial-accounts");

interface AccountRow {
  id: string;
  name: string;
  account_type: string;
  classification: string;
  mask: string | null;
  current_balance_cents: number | null;
  balance_as_of: string | null;
  closed_on: string | null;
}

interface AccountList {
  items: AccountRow[];
  totals: { currency: string; assets_cents: number; liabilities_cents: number; net_cents: number }[];
}

async function listAccounts(api: APIRequestContext): Promise<AccountList> {
  const res = await api.get("/financial-accounts");
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as AccountList;
}

async function accountNamed(api: APIRequestContext, name: string): Promise<AccountRow | undefined> {
  return (await listAccounts(api)).items.find((account) => account.name === name);
}

async function transactionAccount(api: APIRequestContext, id: string): Promise<string | null> {
  const res = await api.get(`/transactions/${id}`);
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { account_id: string | null }).account_id;
}

/** For cleanup: never throws, so it can't hide the test's own failure. */
async function deleteAccountNamed(api: APIRequestContext, name: string): Promise<void> {
  const found = await accountNamed(api, name).catch(() => undefined);
  if (found) await api.delete(`/financial-accounts/${found.id}`).catch(() => undefined);
}

async function openAccounts(page: Page): Promise<void> {
  await page.goto("/financial-accounts");
  await expect(page.getByRole("heading", { name: "Financial Accounts" })).toBeVisible();
  await expect(page.getByTestId("financial-accounts-skeleton")).toBeHidden({ timeout: 15000 });
}

test.describe("Financial accounts", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("add an account, file a transaction under it, then find the transaction by its account", async ({ page }) => {
    const accountName = "E2E Checking";
    const label = `${accountName} ··4821`;
    let transactionId: string | null = null;

    try {
      await openAccounts(page);
      await page.getByTestId("add-financial-account-button").click();
      const dialog = page.getByTestId("add-financial-account-dialog");
      await dialog.getByTestId("financial-account-name-input").fill(accountName);
      await dialog.getByTestId("financial-account-type-select").selectOption("checking");
      await dialog.getByTestId("financial-account-institution-input").fill("Chase");
      await dialog.getByTestId("financial-account-mask-input").fill("4821");
      await dialog.getByTestId("financial-account-balance-input").fill("2500.00");
      await dialog.getByTestId("financial-account-balance-date-input").fill("2026-11-01");
      await dialog.getByTestId("financial-account-save-button").click();

      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("financial-accounts-assets")).toContainText(label);
      await expect(page.getByTestId("financial-accounts-total-assets")).toContainText("$2,500.00");
      await expect(page.getByTestId("financial-accounts-total-net")).toContainText("$2,500.00");

      const saved = await accountNamed(org().api, accountName);
      expect(saved).toMatchObject({
        account_type: "checking",
        classification: "asset",
        mask: "4821",
        current_balance_cents: 250000,
        balance_as_of: "2026-11-01",
        closed_on: null,
      });
      const accountId = saved!.id;

      ({ id: transactionId } = await createTransaction(org().api, { vendor: "E2E Account Grocer", amount: "42.10" }));

      await page.goto("/transactions");
      const row = page.locator("tbody tr").filter({ hasText: "E2E Account Grocer" });
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      const panel = page.getByRole("dialog", { name: "E2E Account Grocer" });
      await panel.getByTestId("transaction-account-select").selectOption(accountId);
      await panel.getByRole("button", { name: /^save$/i }).click();

      await expect.poll(() => transactionAccount(org().api, transactionId!)).toBe(accountId);
      await expect(row).toContainText(label);

      // Filtering by the account keeps the row; it's the only one filed under it.
      await page.getByRole("combobox", { name: "Filter by account" }).selectOption(accountId);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(row).toBeVisible();
    } finally {
      if (transactionId) await deleteTransaction(org().api, transactionId).catch(() => undefined);
      await deleteAccountNamed(org().api, accountName);
    }
  });

  test("restating a balance updates the totals, and a closed account stops counting", async ({ page }) => {
    const accountName = "E2E Sapphire";
    const created = await org().api.post("/financial-accounts", {
      data: {
        name: accountName,
        account_type: "credit_card",
        mask: "1234",
        current_balance_cents: 50000,
        balance_as_of: "2026-11-01",
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const { id } = (await created.json()) as AccountRow;

    try {
      await openAccounts(page);
      const row = page.getByTestId(`financial-account-row-${id}`);
      await expect(page.getByTestId("financial-accounts-liabilities")).toContainText(`${accountName} ··1234`);
      await expect(page.getByTestId("financial-accounts-total-liabilities")).toContainText("$500.00");

      await row.getByTestId("financial-account-update-balance").click();
      const balance = page.getByTestId("update-balance-dialog");
      await balance.getByTestId("financial-account-balance-input").fill("812.40");
      await balance.getByTestId("financial-account-balance-date-input").fill("2026-11-20");
      await balance.getByTestId("financial-account-save-button").click();
      await expect(balance).toBeHidden();

      await expect(row.getByTestId("financial-account-balance")).toContainText("$812.40");
      await expect(page.getByTestId("financial-accounts-total-liabilities")).toContainText("$812.40");
      await expect.poll(async () => (await accountNamed(org().api, accountName))?.current_balance_cents).toBe(81240);

      await row.getByTestId("financial-account-edit").click();
      const edit = page.getByTestId("edit-financial-account-dialog");
      await edit.getByTestId("financial-account-toggle-closed-button").click();
      await expect(edit).toBeHidden();

      await expect(page.getByTestId("financial-accounts-closed")).toContainText(accountName);
      await expect(page.getByTestId("financial-accounts-no-totals")).toBeVisible();
      await expect.poll(async () => (await accountNamed(org().api, accountName))?.closed_on).not.toBeNull();
      expect((await listAccounts(org().api)).totals).toEqual([]);
    } finally {
      await org().api.delete(`/financial-accounts/${id}`).catch(() => undefined);
    }
  });
});
