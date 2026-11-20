/**
 * No-backend E2E for the tax year question in the transaction editor.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Moving a December rent payment's date into January used to leave its tax year behind
 * without a word, so the Tax Report and the return disagreed. Verifies, on /transactions:
 *   - A date moved into another year asks "Move it to tax year N?", in the phone's words.
 *   - "Move to N" sends the new tax year with the date; "Keep N" sends only the date.
 *   - "Keep editing" sends nothing and leaves the edit in the form.
 *   - A date that stays in the same year saves without asking.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";
import { json } from "@platform/ui/test-support/mockResponse";

const TXN_ID = "00000000-0000-0000-0000-0000000000c1";

const TXN = {
  id: TXN_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: "December Rent",
  vendor_id: null,
  description: null,
  amount: "1500.00",
  transaction_type: "income",
  category: "rental_revenue",
  tags: [],
  property_id: null,
  tax_relevant: true,
  is_capital_improvement: false,
  payment_method: null,
  channel: null,
  transaction_date: "2025-12-30",
  tax_year: 2025,
  status: "approved",
  is_manual: true,
  source_document_id: null,
  created_at: "2025-12-30T00:00:00Z",
  updated_at: "2025-12-30T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
};

interface FakeServer {
  patches: unknown[];
}

async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { patches: [] };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  // An income row offers its tenants to attribute it to.
  await page.route("**/api/applicants/tenants?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await stubTransactionPages(page, [TXN]);
  await page.route(`**/api/transactions/${TXN_ID}`, async (route, request: Request) => {
    if (request.method() !== "PATCH") {
      await route.fulfill(json(TXN));
      return;
    }
    server.patches.push(request.postDataJSON());
    await route.fulfill(json({ ...TXN, ...(request.postDataJSON() as object), retroactive_count: 0 }));
  });
  return server;
}

async function openAndMoveDate(page: Page, date: string) {
  await page.goto("/transactions");
  await page.getByText("December Rent").locator("visible=true").first().click();
  const panel = page.getByRole("dialog", { name: "December Rent" });
  // Located by its id: once edited, the field's label also reads "modified".
  const dateId = await panel.getByLabel("Date", { exact: true }).getAttribute("id");
  const dateInput = panel.locator(`[id="${dateId}"]`);
  await expect(dateInput).toHaveValue("2025-12-30");
  await dateInput.fill(date);
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  return { panel, dateInput };
}

test.describe("Transaction editor: tax year question", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  test("a date moved into the next year asks, and Move sends the new tax year", async ({ page }) => {
    const { panel } = await openAndMoveDate(page, "2026-01-02");

    const question = page.getByRole("alertdialog", { name: "Move it to tax year 2026?" });
    await expect(question).toContainText("The new date is in 2026, but this is filed under tax year 2025.");
    expect(server.patches).toEqual([]);

    await question.getByRole("button", { name: "Move to 2026" }).click();

    await expect(panel).toHaveCount(0);
    expect(server.patches).toEqual([{ transaction_date: "2026-01-02", tax_year: 2026 }]);
  });

  test("Keep sends only the date", async ({ page }) => {
    const { panel } = await openAndMoveDate(page, "2026-01-02");

    await page.getByRole("alertdialog", { name: "Move it to tax year 2026?" }).getByRole("button", { name: "Keep 2025" }).click();

    await expect(panel).toHaveCount(0);
    expect(server.patches).toEqual([{ transaction_date: "2026-01-02" }]);
  });

  test("Keep editing sends nothing and keeps the edit", async ({ page }) => {
    const { panel, dateInput } = await openAndMoveDate(page, "2026-01-02");

    const question = page.getByRole("alertdialog", { name: "Move it to tax year 2026?" });
    await question.getByRole("button", { name: "Keep editing" }).click();

    await expect(question).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(dateInput).toHaveValue("2026-01-02");
    expect(server.patches).toEqual([]);
  });

  test("a date in the same year saves without asking", async ({ page }) => {
    const { panel } = await openAndMoveDate(page, "2025-12-15");

    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(server.patches).toEqual([{ transaction_date: "2025-12-15" }]);
  });
});
