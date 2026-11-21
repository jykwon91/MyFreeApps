/**
 * No-backend E2E: the Transactions table works from the keyboard alone.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies a column header is a real button that sorts on Enter (the server is asked for that
 * order and the header reports it through aria-sort), and that a row stays a plain table row whose
 * vendor is a real button that opens it with Enter or Space, while a key pressed on the row's
 * checkbox does not open it.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages, stubTransactionSelection } from "./fixtures/mockTransactions";

const ROWS = Array.from({ length: 3 }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: `Vendor ${i + 1}`,
  vendor_id: null,
  description: null,
  amount: "10.00",
  transaction_type: "expense",
  category: "repairs",
  tags: [],
  property_id: null,
  tax_relevant: true,
  payment_method: null,
  channel: null,
  transaction_date: "2024-06-15",
  tax_year: 2024,
  status: "approved",
  is_manual: true,
  source_document_id: null,
  linked_document_ids: [],
  created_at: "2024-06-15T00:00:00Z",
  updated_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
}));

test("transactions: sort a column and open a row using only the keyboard", async ({ page }) => {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/transactions/attribution-review-queue?**", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  // The edit panel's vendor picker pages through /vendors.
  await page.route(/\/api\/vendors(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  const requests = await stubTransactionPages(page, ROWS);
  await stubTransactionSelection(page, ROWS);

  await page.goto("/transactions");
  const table = page.getByRole("table");
  await expect(table.getByText("Vendor 1", { exact: true })).toBeVisible();

  const vendorHeader = table.getByRole("columnheader", { name: "Vendor" });
  await vendorHeader.getByRole("button", { name: "Vendor" }).focus();
  await page.keyboard.press("Enter");
  await expect(vendorHeader).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(() => requests.some((params) => params.getAll("sort").includes("vendor:asc"))).toBe(true);

  // The row stays a plain table row; its vendor is the real button that opens it.
  const firstRow = table.getByRole("row").filter({ hasText: "Vendor 1" });
  await expect(firstRow).not.toHaveAttribute("role");
  await expect(firstRow).not.toHaveAttribute("tabindex");
  const openButton = firstRow.getByRole("button", { name: "Open Vendor 1" });

  await firstRow.getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Close panel" })).toHaveCount(0);

  await openButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Close panel" })).toBeVisible();

  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByRole("button", { name: "Close panel" })).toHaveCount(0);

  await openButton.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Close panel" })).toBeVisible();
});
