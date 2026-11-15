/**
 * No-backend E2E: a filter change that fails never leaves the previous filter's rows on screen.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * RTK Query's `data` keeps the previous filter's answer while a new filter loads and after it
 * failed, so the list pages used to show the old rows under the new filter (on Applicants with the
 * stage badges hidden, as if they were filtered), and under its error. Verifies, holding the new
 * filter's answer open and then failing it:
 *   - /applicants: a stage chip shows the skeleton while it loads, then the error, never the
 *     previous stage's applicants.
 *   - /transactions: a header filter keeps the table (and its filters) but shows placeholder rows,
 *     then the error with no rows and no "X–Y of Z" count from the previous filter; Retry loads it.
 */
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages, stubTransactionSelection } from "./fixtures/mockTransactions";

const SERVER_ERROR = json({ detail: "Internal Server Error" }, 500);

/** A request the spec answers when it chooses: `fail()` answers it with a 500. */
function heldRequest() {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async hold(route: Route): Promise<void> {
      await released;
      await route.fulfill(SERVER_ERROR);
    },
    fail: () => release(),
  };
}

async function openShell(page: Page): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
}

const LEAD = {
  id: "00000000-0000-0000-0000-0000000000c1",
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  inquiry_id: null,
  legal_name: "Lena Lead",
  employer_or_hospital: null,
  contract_start: null,
  contract_end: null,
  stage: "lead",
  tenant_ended_at: null,
  tenant_ended_reason: null,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

test("applicants: a failed stage filter shows its skeleton, then its error, never the previous stage's applicants", async ({ page }) => {
  await openShell(page);
  const approved = heldRequest();
  await page.route(/\/api\/applicants(\?|$)/, (route) => {
    const stage = new URL(route.request().url()).searchParams.get("stage");
    if (stage === "approved") return approved.hold(route);
    return route.fulfill(json({ items: [LEAD], total: 1, has_more: false }));
  });

  await page.goto("/applicants");
  await expect(page.getByText("Lena Lead").locator("visible=true").first()).toBeVisible();

  await page.getByTestId("applicant-filter-approved").click();

  await expect(page.getByTestId("applicants-skeleton")).toBeVisible();
  await expect(page.getByText("Lena Lead")).toHaveCount(0);

  approved.fail();

  await expect(page.getByText("I couldn't load your applicants.")).toBeVisible();
  await expect(page.getByText("Lena Lead")).toHaveCount(0);
  await expect(page.getByTestId("applicants-skeleton")).toHaveCount(0);
});

const TOTAL = 30;
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
  status: i % 3 === 2 ? "pending" : "approved",
  is_manual: true,
  source_document_id: null,
  linked_document_ids: [],
  created_at: "2024-06-15T00:00:00Z",
  updated_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
}));
const PENDING_TOTAL = ROWS.filter((row) => row.status === "pending").length;

test("transactions: a failed header filter shows placeholder rows, then its error with no previous rows or count, and Retry loads it", async ({ page }) => {
  await openShell(page);
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await stubTransactionPages(page, ROWS);
  await stubTransactionSelection(page, ROWS);
  const pending = heldRequest();
  let failsPending = true;
  // Registered last, so it is asked first; it falls back to the paging stub once the filter recovers.
  await page.route(/\/api\/transactions\/page(\?|$)/, (route) => {
    const filtered = new URL(route.request().url()).searchParams.getAll("statuses").length > 0;
    if (filtered && failsPending) return pending.hold(route);
    return route.fallback();
  });

  await page.goto("/transactions");
  const table = page.getByRole("table");
  await expect(page.getByText(`1–25 of ${TOTAL}`)).toBeVisible();
  await expect(table.getByText("Vendor 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Filter status" }).click();
  await page.getByRole("checkbox", { name: "Pending" }).check();

  await expect(table.getByTestId("transaction-skeleton-row").first()).toBeVisible();
  await expect(table.getByText("Vendor 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`1–25 of ${TOTAL}`)).toHaveCount(0);

  pending.fail();

  await expect(page.getByText("I couldn't load your transactions. Want me to try again?")).toBeVisible();
  await expect(table.getByText("Vendor 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`1–25 of ${TOTAL}`)).toHaveCount(0);
  await expect(table.getByTestId("transaction-skeleton-row")).toHaveCount(0);
  await expect(page.getByText("No transactions found")).toHaveCount(0);

  failsPending = false;
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(page.getByText(`1–${PENDING_TOTAL} of ${PENDING_TOTAL}`)).toBeVisible();
  await expect(table.getByText("Vendor 3", { exact: true })).toBeVisible();
  await expect(page.getByText("I couldn't load your transactions. Want me to try again?")).toHaveCount(0);
});
