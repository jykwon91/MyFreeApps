/**
 * No-backend E2E for paging the Transactions table past what one request returns.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies, on /transactions:
 *   - Each page is asked of the server by limit and offset; page 2 at 50 rows per
 *     page shows rows 51+, and the "X–Y of Z" footer counts from the server's total.
 *   - A multi-select header filter (Status: Pending + Needs Review) is sent to the
 *     server as repeated `statuses`, starts again from the first page, and the
 *     footer counts what it matches.
 *   - Shift-clicking a second column header sends both columns as repeated `sort`
 *     keys, the first-clicked one first.
 *   - Ticked rows that a filter-bar change hides are unticked (after the
 *     /transactions/selection check, during which bulk actions wait), so a bulk
 *     delete only sends the ticked rows the filter still shows.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages, stubTransactionSelection } from "./fixtures/mockTransactions";

const TOTAL = 75;
const STATUSES = ["approved", "approved", "pending"] as const;

const ROWS = Array.from({ length: TOTAL }, (_, i) => ({
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
  status: STATUSES[i % STATUSES.length],
  is_manual: true,
  source_document_id: null,
  linked_document_ids: [],
  created_at: "2024-06-15T00:00:00Z",
  updated_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
}));
const PENDING_TOTAL = ROWS.filter((row) => row.status === "pending").length;

interface MockedList {
  pages: URLSearchParams[];
  selections: URLSearchParams[];
  bulkDeletes: unknown[];
}

async function openList(page: Page): Promise<URLSearchParams[]> {
  return (await openMockedList(page)).pages;
}

async function openMockedList(page: Page): Promise<MockedList> {
  await plantAuth(page);
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  const pages = await stubTransactionPages(page, ROWS);
  const selections = await stubTransactionSelection(page, ROWS);
  const bulkDeletes: unknown[] = [];
  await page.route("**/api/transactions/bulk-delete", (route) => {
    const body: unknown = route.request().postDataJSON();
    bulkDeletes.push(body);
    return route.fulfill(json({ deleted: 1, skipped: 0 }));
  });
  await page.goto("/transactions");
  return { pages, selections, bulkDeletes };
}

const table = (page: Page) => page.getByRole("table");
const lastRequest = (requests: URLSearchParams[]) => requests[requests.length - 1];

test.describe("Transactions table paging", () => {
  test("page 2 shows rows 51+ and counts from the server's total", async ({ page }) => {
    const requests = await openList(page);
    await expect(page.getByText(`1–25 of ${TOTAL}`)).toBeVisible();

    await page.getByRole("combobox", { name: "Rows per page" }).selectOption("50");
    await expect(page.getByText(`1–50 of ${TOTAL}`)).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();

    await expect(page.getByText(`51–${TOTAL} of ${TOTAL}`)).toBeVisible();
    await expect(table(page).getByText("Vendor 51", { exact: true })).toBeVisible();
    await expect(table(page).getByText(`Vendor ${TOTAL}`, { exact: true })).toBeVisible();
    await expect(table(page).getByText("Vendor 50", { exact: true })).toHaveCount(0);
    expect(lastRequest(requests).get("limit")).toBe("50");
    expect(lastRequest(requests).get("offset")).toBe("50");
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("a multi-select header filter is applied by the server from the first page", async ({ page }) => {
    const requests = await openList(page);
    await expect(page.getByText(`1–25 of ${TOTAL}`)).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText(`26–50 of ${TOTAL}`)).toBeVisible();

    await page.getByRole("button", { name: "Filter status" }).click();
    await page.getByRole("checkbox", { name: "Pending" }).check();
    await page.getByRole("checkbox", { name: "Needs Review" }).check();

    await expect(page.getByText(`1–${PENDING_TOTAL} of ${PENDING_TOTAL}`)).toBeVisible();
    expect(lastRequest(requests).getAll("statuses")).toEqual(["pending", "needs_review"]);
    expect(lastRequest(requests).get("offset")).toBe("0");
    await expect(table(page).getByText("Vendor 3", { exact: true })).toBeVisible();
    await expect(table(page).getByText("Vendor 1", { exact: true })).toHaveCount(0);
  });

  test("shift-clicking a second header sorts by both columns on the server", async ({ page }) => {
    const requests = await openList(page);
    await expect(page.getByText(`1–25 of ${TOTAL}`)).toBeVisible();

    await page.getByRole("columnheader", { name: /Property/ }).click();
    await expect.poll(() => lastRequest(requests).getAll("sort")[0]).toMatch(/^property_id:/);
    await page.getByRole("columnheader", { name: /Amount/ }).click({ modifiers: ["Shift"] });

    await expect.poll(() => lastRequest(requests).getAll("sort").length).toBe(2);
    const [first, second] = lastRequest(requests).getAll("sort");
    expect(first).toMatch(/^property_id:/);
    expect(second).toMatch(/^amount:(asc|desc)$/);
  });

  test("a filter-bar change unticks the rows it hides, so bulk delete leaves them alone", async ({ page }) => {
    const { selections, bulkDeletes } = await openMockedList(page);
    await expect(page.getByText(`1–25 of ${TOTAL}`)).toBeVisible();
    // Vendor 1 is approved, Vendor 3 pending.
    await page.getByRole("checkbox", { name: "Select Vendor 1", exact: true }).check();
    await page.getByRole("checkbox", { name: "Select Vendor 3", exact: true }).check();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("combobox", { name: "Filter by status" }).selectOption("pending");

    await expect(page.getByText("1 selected")).toBeVisible();
    expect(selections.map((params) => params.get("status"))).toEqual(["pending"]);
    const bulkBar = page.getByText("1 selected").locator("..");
    await bulkBar.getByRole("button", { name: /Delete/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect.poll(() => bulkDeletes).toEqual([{ ids: [ROWS[2].id] }]);
  });
});
