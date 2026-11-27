/**
 * No-backend E2E for the "Assign vendor" dropdown in the transaction editor.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies, on /transactions, with more vendors than one page holds:
 *   - The dropdown offers the first page, and Load more brings in the rest.
 *   - A vendor from the second page can be picked and is what Save & close sends.
 *   - A transaction assigned to a vendor on a later page still shows that vendor's name.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";
import { json } from "@platform/ui/test-support/mockResponse";

const TXN_ID = "00000000-0000-0000-0000-0000000000a1";
const PAGE_SIZE = 25;
const VENDOR_COUNT = PAGE_SIZE + 5;
const CREATED = "2024-06-15T00:00:00Z";

const VENDORS = Array.from({ length: VENDOR_COUNT }, (_, i) => ({
  id: `vendor-${i + 1}`,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  name: `Vendor ${i + 1}`,
  category: "plumber",
  phone: null,
  hourly_rate: null,
  preferred: false,
  last_used_at: null,
  created_at: CREATED,
  updated_at: CREATED,
}));

function transactionWith(vendorId: string | null) {
  return {
    id: TXN_ID,
    organization_id: ORG_ID,
    user_id: "00000000-0000-0000-0000-000000000001",
    vendor: "Test Plumber",
    vendor_id: vendorId,
    description: null,
    amount: "500.00",
    transaction_type: "expense",
    category: "contract_work",
    tags: [],
    property_id: null,
    property_splits: [],
    tax_relevant: true,
    payment_method: null,
    channel: null,
    transaction_date: "2024-06-15",
    tax_year: 2024,
    status: "approved",
    is_manual: true,
    source_document_id: null,
    created_at: CREATED,
    updated_at: CREATED,
    applicant_id: null,
    attribution_source: null,
  };
}

async function stubApi(page: Page, vendorId: string | null): Promise<unknown[]> {
  const patches: unknown[] = [];
  const txn = transactionWith(vendorId);
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await page.route("**/api/vendors?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const items = VENDORS.slice(offset, offset + Number(params.get("limit") ?? PAGE_SIZE));
    return route.fulfill(json({ items, total: VENDORS.length, has_more: offset + items.length < VENDORS.length }));
  });
  await page.route(/\/api\/vendors\/vendor-\d+$/, (route) => {
    const id = route.request().url().split("/").pop();
    return route.fulfill(json(VENDORS.find((vendor) => vendor.id === id)));
  });
  await stubTransactionPages(page, [txn]);
  await page.route(`**/api/transactions/${TXN_ID}`, async (route, request: Request) => {
    if (request.method() !== "PATCH") {
      await route.fulfill(json(txn));
      return;
    }
    patches.push(request.postDataJSON());
    await route.fulfill(json({ ...txn, ...(request.postDataJSON() as object), retroactive_count: 0 }));
  });
  return patches;
}

async function openTransaction(page: Page): Promise<void> {
  await page.goto("/transactions");
  await page.getByText("Test Plumber").locator("visible=true").first().click();
  await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveValue("Test Plumber");
}

test.describe("Transaction editor: assign vendor", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("Load more reaches a vendor past the first page, and it is saved", async ({ page }) => {
    const patches = await stubApi(page, null);
    await openTransaction(page);
    const select = page.getByTestId("vendor-id-select");
    await expect(select.getByRole("option", { name: "Vendor 25" })).toHaveCount(1);
    await expect(select.getByRole("option", { name: "Vendor 30" })).toHaveCount(0);

    await page.getByTestId("load-more-button").click();
    await select.selectOption({ label: "Vendor 30" });
    await expect(select).toHaveValue("vendor-30");
    await expect(page.getByTestId("load-more-button")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog", { name: "Save your changes?" }).getByRole("button", { name: "Save & close" }).click();
    await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveCount(0);
    expect(patches).toEqual([{ vendor_id: "vendor-30" }]);
  });

  test("an assigned vendor on a later page still shows its name", async ({ page }) => {
    await stubApi(page, "vendor-30");
    await openTransaction(page);
    const select = page.getByTestId("vendor-id-select");

    await expect(select.locator("option:checked")).toHaveText("Vendor 30");
  });
});
