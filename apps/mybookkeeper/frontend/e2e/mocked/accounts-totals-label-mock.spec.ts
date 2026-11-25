/**
 * No-backend E2E for the totals row on /financial-accounts.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - the totals say they cover these accounts and never call that figure "Net worth";
 *   - "See your net worth" opens /net-worth, where properties are counted.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import type { FinancialAccountListResponse } from "@mybookkeeper/api-client/types/financial-account/financial-account-list-response";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const ACCOUNTS: FinancialAccountListResponse = {
  items: [
    {
      id: "00000000-0000-0000-0000-0000000000a1",
      organization_id: ORG_ID,
      user_id: "00000000-0000-0000-0000-000000000001",
      name: "Personal checking",
      institution_name: "Chase",
      account_type: "checking",
      classification: "asset",
      mask: "8078",
      currency: "USD",
      current_balance_cents: 3_600_100,
      balance_as_of: "2026-11-24",
      closed_on: null,
      mortgage_id: null,
      default_transaction_scope: "personal",
      plaid_item_id: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    },
  ],
  totals: [{ currency: "USD", assets_cents: 3_600_100, liabilities_cents: 73_068_410, net_cents: -69_468_310 }],
};

const NET_WORTH = {
  currency: "USD",
  as_of: "2026-11-25",
  assets_cents: 0,
  liabilities_cents: 0,
  net_cents: 0,
  groups: [],
};

async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route, request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  // Financial Accounts loads Plaid Link's script; this spec never opens Link.
  await page.route("https://cdn.plaid.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.route(/\/api\/financial-accounts(\?|$)/, (route) => route.fulfill(json(ACCOUNTS)));
  await page.route("**/api/net-worth", (route) => route.fulfill(json(NET_WORTH)));
  await page.route("**/api/net-worth/history**", (route) =>
    route.fulfill(json({ range: "3m", currency: "USD", points: [] })),
  );
}

test.describe("Financial Accounts: totals label", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    await stubApi(page);
  });

  test("calls the figure the accounts balance and links to the real net worth", async ({ page }) => {
    await page.goto("/financial-accounts");
    const totals = page.getByTestId("financial-accounts-totals");
    await expect(totals.getByTestId("financial-accounts-total-net")).toContainText("Accounts balance");
    await expect(totals.getByTestId("financial-accounts-total-assets")).toContainText("What you have in these accounts");
    await expect(totals).not.toContainText("Net worth");

    await totals.getByRole("link", { name: "See your net worth" }).click();
    await expect(page).toHaveURL(/\/net-worth$/);
  });
});
