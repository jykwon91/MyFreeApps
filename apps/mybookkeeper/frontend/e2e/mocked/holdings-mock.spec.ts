/**
 * No-backend E2E for /investments.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job. The fake server keeps the holdings in
 * memory and recomputes the totals, so each write is checked end to end:
 * request sent, toast shown, list refetched.
 *
 * Verifies:
 *   - the page is reachable from the nav, in the Money group;
 *   - totals, the split by type and every holding (with gain/loss) are shown,
 *     a synced holding is read-only and an old price is flagged;
 *   - adding a holding by hand sends decimals as strings, toasts, and shows it;
 *   - editing sends only what changed; removing asks first;
 *   - picking one account narrows the list, keeps it in ?account=, and asks
 *     the server for that account;
 *   - with no investment account it points to Financial Accounts;
 *   - the skeleton has the loaded page's shape;
 *   - on a phone the page shows cards, not the table, and never scrolls sideways.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const BROKERAGE = "44444444-4444-4444-4444-444444444444";
const IRA = "55555555-5555-5555-5555-555555555555";

function account(id: string, name: string, plaidItemId: string | null) {
  return {
    id, organization_id: "o", user_id: "u", name, institution_name: null, account_type: id === IRA ? "retirement" : "brokerage",
    classification: "asset", mask: null, currency: "USD", current_balance_cents: null, balance_as_of: null,
    closed_on: null, mortgage_id: null, default_transaction_scope: "personal", plaid_item_id: plaidItemId,
    created_at: "", updated_at: "",
  };
}

interface FakeHolding {
  id: string;
  financial_account_id: string;
  ticker_symbol: string | null;
  name: string | null;
  security_type: string;
  quantity: string;
  price: string;
  price_as_of: string;
  is_price_stale: boolean;
  cost_basis_cents: number | null;
}

function line(h: FakeHolding) {
  const value = Math.round(Number(h.quantity) * Number(h.price) * 100);
  const gain = h.cost_basis_cents === null ? null : value - h.cost_basis_cents;
  return {
    ...h,
    account_name: h.financial_account_id === IRA ? "Fidelity IRA" : "Brokerage",
    is_manual: h.financial_account_id !== IRA,
    security_id: `sec-${h.id}`,
    value_cents: value,
    gain_loss_cents: gain,
    gain_loss_percent: gain === null || !h.cost_basis_cents ? null : (gain / h.cost_basis_cents) * 100,
    currency: "USD",
  };
}

function listing(holdings: FakeHolding[], accountId: string | null) {
  const lines = holdings.filter((h) => accountId === null || h.financial_account_id === accountId).map(line)
    .sort((a, b) => b.value_cents - a.value_cents);
  const total = lines.reduce((sum, l) => sum + l.value_cents, 0);
  const byType = new Map<string, number>();
  for (const l of lines) byType.set(l.security_type, (byType.get(l.security_type) ?? 0) + l.value_cents);
  const costed = lines.filter((l) => l.cost_basis_cents !== null);
  const cost = costed.reduce((sum, l) => sum + (l.cost_basis_cents ?? 0), 0);
  const costedValue = costed.reduce((sum, l) => sum + l.value_cents, 0);
  return {
    financial_account_id: accountId,
    currency: "USD",
    holdings: lines,
    totals: {
      value_cents: total,
      cost_basis_cents: costed.length ? cost : null,
      gain_loss_cents: costed.length ? costedValue - cost : null,
      gain_loss_percent: cost > 0 ? ((costedValue - cost) / cost) * 100 : null,
    },
    allocation: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, cents]) => ({
      security_type: type, value_cents: cents, percent: total > 0 ? (cents / total) * 100 : null,
    })),
  };
}

const SEED: FakeHolding[] = [
  {
    id: "h-vti", financial_account_id: BROKERAGE, ticker_symbol: "VTI", name: "Vanguard Total Stock",
    security_type: "etf", quantity: "10", price: "250", price_as_of: "2026-11-24", is_price_stale: false,
    cost_basis_cents: 200_000,
  },
  {
    id: "h-bnd", financial_account_id: IRA, ticker_symbol: "BND", name: "Vanguard Total Bond",
    security_type: "fixed_income", quantity: "20", price: "72.5", price_as_of: "2026-11-01", is_price_stale: true,
    cost_basis_cents: 160_000,
  },
];

interface FakeServer {
  listQueries: (string | null)[];
  creates: unknown[];
  updates: unknown[];
  deletes: string[];
}

async function stubApi(page: Page, { noAccounts = false, hold = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { listQueries: [], creates: [], updates: [], deletes: [] };
  let holdings = SEED.map((h) => ({ ...h }));
  let nextId = 1;
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/financial-accounts**", (route) =>
    route.fulfill(json({
      items: noAccounts ? [] : [account(BROKERAGE, "Brokerage", null), account(IRA, "Fidelity IRA", "item-1")],
      totals: [],
    })),
  );
  await page.route(/\/api\/holdings(\?.*)?$/, async (route, request: Request) => {
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Omit<FakeHolding, "id" | "price_as_of" | "is_price_stale">;
      server.creates.push(body);
      const created: FakeHolding = { ...body, id: `h-new-${nextId++}`, price_as_of: "2026-11-24", is_price_stale: false };
      holdings = [...holdings, created];
      return route.fulfill(json(line(created), 201));
    }
    if (hold) return; // never answered: the page stays loading
    const accountId = new URL(request.url()).searchParams.get("financial_account_id");
    server.listQueries.push(accountId);
    return route.fulfill(json(listing(holdings, accountId)));
  });
  await page.route(/\/api\/holdings\/[^/?]+$/, async (route, request: Request) => {
    const id = new URL(request.url()).pathname.split("/").pop() ?? "";
    if (request.method() === "DELETE") {
      server.deletes.push(id);
      holdings = holdings.filter((h) => h.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    const body = request.postDataJSON() as Partial<FakeHolding>;
    server.updates.push(body);
    holdings = holdings.map((h) => (h.id === id ? { ...h, ...body } : h));
    return route.fulfill(json(line(holdings.find((h) => h.id === id) as FakeHolding)));
  });
  return server;
}

test.describe("Investments", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and shows totals, the split by type and every holding", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Investments" }).first().click();
    await expect(page).toHaveURL(/\/investments$/);

    await expect(page.getByTestId("holdings-total-value")).toContainText("$3,950.00");
    await expect(page.getByTestId("holdings-total-cost-basis")).toContainText("$3,600.00");
    await expect(page.getByTestId("holdings-total-gain-loss")).toContainText("+$350.00");
    await expect(page.getByTestId("holdings-allocation-chart")).toBeVisible();
    await expect(page.getByTestId("holdings-allocation-list")).toContainText("ETF");
    await expect(page.getByTestId("holdings-allocation-list")).toContainText("Bond");

    const vti = page.getByTestId("holding-row-h-vti");
    await expect(vti.getByTestId("holding-value")).toContainText("$2,500.00");
    await expect(vti.getByTestId("holding-gain-loss")).toContainText("+$500.00");
    const bnd = page.getByTestId("holding-row-h-bnd");
    await expect(bnd).toContainText("Synced from your bank");
    await expect(bnd.getByTestId("holding-edit")).toHaveCount(0);
    await expect(bnd.getByTestId("holding-stale-price")).toContainText("Nov 1, 2026");
    await expect(page.getByTestId("holdings-stale-hint")).toBeVisible();
  });

  test("a holding added by hand is sent as typed, confirmed and listed", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/investments");
    await expect(page.getByTestId("holding-row-h-vti")).toBeVisible();

    await page.getByTestId("add-holding-button").click();
    const dialog = page.getByTestId("add-holding-dialog");
    await expect(dialog.getByTestId("holding-account-select")).toHaveValue(BROKERAGE);
    await dialog.getByTestId("holding-ticker-input").fill("aapl");
    await dialog.getByTestId("holding-type-select").selectOption("equity");
    await dialog.getByTestId("holding-quantity-input").fill("2.5");
    await dialog.getByTestId("holding-price-input").fill("200.125");
    await dialog.getByTestId("holding-save-button").click();

    await expect(toast(page, "Holding added.")).toBeVisible();
    expect(server.creates).toEqual([{
      financial_account_id: BROKERAGE, ticker_symbol: "AAPL", name: null, security_type: "equity",
      quantity: "2.5", price: "200.125", cost_basis_cents: null,
    }]);
    await expect(page.getByTestId("holding-row-h-new-1").getByTestId("holding-value")).toContainText("$500.31");
    await expect(page.getByTestId("holdings-total-value")).toContainText("$4,450.31");
  });

  test("a bad entry is shown on the field and never sent", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/investments");
    await page.getByTestId("add-holding-button").click();
    const dialog = page.getByTestId("add-holding-dialog");
    await dialog.getByTestId("holding-ticker-input").fill("VTI");
    await dialog.getByTestId("holding-quantity-input").fill("0");
    await dialog.getByTestId("holding-price-input").fill("12");
    await dialog.getByTestId("holding-save-button").click();
    await expect(dialog).toContainText("Enter more than zero.");
    expect(server.creates).toEqual([]);
  });

  test("editing sends only the new price and removing asks first", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/investments");
    const vti = page.getByTestId("holding-row-h-vti");

    await vti.getByTestId("holding-edit").click();
    const dialog = page.getByTestId("edit-holding-dialog");
    await dialog.getByTestId("holding-price-input").fill("260");
    await dialog.getByTestId("holding-save-button").click();
    await expect(toast(page, "Holding saved.")).toBeVisible();
    expect(server.updates).toEqual([{ price: "260" }]);
    await expect(vti.getByTestId("holding-value")).toContainText("$2,600.00");

    await vti.getByTestId("holding-remove").click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText("Remove this holding?");
    expect(server.deletes).toEqual([]);
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(toast(page, "Holding removed.")).toBeVisible();
    expect(server.deletes).toEqual(["h-vti"]);
    await expect(page.getByTestId("holding-row-h-vti")).toHaveCount(0);
  });

  test("picking an account narrows the list and keeps it in the address", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/investments");
    await expect(page.getByTestId("holding-row-h-vti")).toBeVisible();

    await page.getByTestId("holdings-account").selectOption(IRA);
    await expect(page).toHaveURL(new RegExp(`\\?account=${IRA}$`));
    await expect(page.getByTestId("holding-row-h-vti")).toHaveCount(0);
    await expect(page.getByTestId("holding-row-h-bnd")).toBeVisible();
    await expect(page.getByTestId("holdings-total-value")).toContainText("$1,450.00");
    await expect(page.getByTestId("add-holding-button")).toHaveCount(0);
    expect(server.listQueries).toContain(IRA);

    await page.reload();
    await expect(page.getByTestId("holdings-account")).toHaveValue(IRA);
  });

  test("with no investment account it points to Financial Accounts", async ({ page }) => {
    await stubApi(page, { noAccounts: true });
    await page.goto("/investments");
    await page.getByRole("button", { name: "Go to Financial Accounts" }).click();
    await expect(page).toHaveURL(/\/financial-accounts$/);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/investments");
    await expect(page.getByTestId("holdings-skeleton")).toBeVisible();
    await expect(page.getByTestId("holdings-skeleton-tile")).toHaveCount(3);
    await expect(page.getByTestId("holdings-skeleton-allocation")).toHaveCount(1);
    await expect(page.getByTestId("holdings-skeleton-row")).not.toHaveCount(0);
  });

  test("fits a phone screen with cards instead of the table", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/investments");
    await expect(page.getByTestId("holding-card-h-vti")).toBeVisible();
    await expect(page.getByTestId("holdings-table")).toBeHidden();
    await page.getByTestId("add-holding-button").click();
    await expect(page.getByTestId("add-holding-dialog")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
