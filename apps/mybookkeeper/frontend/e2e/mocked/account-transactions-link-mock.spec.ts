/**
 * No-backend E2E for the "Transactions" link on each account of /financial-accounts.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - an account's "Transactions" link opens /transactions filtered to that account:
 *     the account filter shows it and the list is asked for that account only;
 *   - changing the account filter drops the account from the address, so a reload
 *     shows what the filter says;
 *   - an address naming something that isn't an account id is ignored.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { FinancialAccountListResponse } from "@mybookkeeper/api-client/types/financial-account/financial-account-list-response";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";

const CHECKING_ID = "00000000-0000-0000-0000-0000000000a1";
const CARD_ID = "00000000-0000-0000-0000-0000000000a2";

function account(id: string, name: string, mask: string, overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id,
    organization_id: ORG_ID,
    user_id: "00000000-0000-0000-0000-000000000001",
    name,
    institution_name: "Chase",
    account_type: "checking",
    classification: "asset",
    mask,
    currency: "USD",
    current_balance_cents: 100_000,
    balance_as_of: "2026-11-24",
    closed_on: null,
    mortgage_id: null,
    default_transaction_scope: "personal",
    plaid_item_id: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

const ACCOUNTS: FinancialAccountListResponse = {
  items: [
    account(CHECKING_ID, "Personal checking", "8078", {}),
    account(CARD_ID, "Personal Credit", "0463", { account_type: "credit_card", classification: "liability" }),
  ],
  totals: [],
};

async function stubApi(page: Page): Promise<URLSearchParams[]> {
  await page.route("**/api/**", (route, request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  // Financial Accounts loads Plaid Link's script, which throws when the page is left
  // before it starts; this spec never opens Link.
  await page.route("https://cdn.plaid.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.route(/\/api\/financial-accounts(\?|$)/, (route) => route.fulfill(json(ACCOUNTS)));
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  return stubTransactionPages(page, []);
}

test.describe("Financial Accounts: an account's transactions", () => {
  let listRequests: URLSearchParams[];

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    listRequests = await stubApi(page);
  });

  test("Transactions opens the Transactions page filtered to that account", async ({ page }) => {
    await page.goto("/financial-accounts");
    const card = page.getByRole("listitem").filter({ hasText: "Personal Credit" });
    await card.getByRole("link", { name: "Transactions" }).click();

    await expect(page).toHaveURL(new RegExp(`/transactions\\?account=${CARD_ID}$`));
    await expect(page.getByLabel("Filter by account")).toHaveValue(CARD_ID);
    await expect.poll(() => listRequests.at(-1)?.get("account_id")).toBe(CARD_ID);
    expect(listRequests.every((params) => params.get("account_id") === CARD_ID)).toBe(true);
  });

  test("changing the account filter drops the account from the address", async ({ page }) => {
    await page.goto(`/transactions?account=${CARD_ID}`);
    const filter = page.getByLabel("Filter by account");
    await expect(filter).toHaveValue(CARD_ID);

    await filter.selectOption(CHECKING_ID);

    await expect(page).toHaveURL(/\/transactions$/);
    await expect.poll(() => listRequests.at(-1)?.get("account_id")).toBe(CHECKING_ID);

    await page.reload();
    await expect(page.getByLabel("Filter by account")).toHaveValue("");
  });

  test("an address naming no account id shows every account", async ({ page }) => {
    await page.goto("/transactions?account=not-an-account");

    await expect(page.getByLabel("Filter by account")).toHaveValue("");
    await expect.poll(() => listRequests.length).toBeGreaterThan(0);
    expect(listRequests.every((params) => !params.has("account_id"))).toBe(true);
  });
});
