/**
 * No-backend E2E for a refused duplicate merge, on the Transactions page's Duplicates tab.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Two copies of one payment linked to different tenants can't be merged: the server
 * answers 409 with the reason rather than picking a tenant. Verifies the reason is
 * what the toast says (it used to read "Failed to merge transactions"), and that a
 * merge that goes through still says so.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";
import { json } from "@platform/ui/test-support/mockResponse";

const REASON =
  "These transactions are linked to different tenants. Set the same one on both, or clear it on one of them, then try again.";

// Radix also keeps a screen-reader copy of a toast for about a second, so a
// bare text match can find two; the visible toast lives in this region.
function notifications(page: Page) {
  return page.getByRole("region", { name: "Notifications" });
}

function side(id: string, description: string | null) {
  return {
    id,
    transaction_date: "2025-06-01",
    vendor: "Zelle",
    description,
    amount: "1500.00",
    transaction_type: "income",
    category: "rental_revenue",
    property_id: null,
    payment_method: null,
    channel: null,
    tags: [],
    status: "approved",
    source_document_id: null,
    source_file_name: null,
    is_manual: false,
    created_at: "2025-06-01T00:00:00Z",
    linked_document_ids: [],
  };
}

const PAIR = {
  id: "pair-1",
  transaction_a: side("00000000-0000-0000-0000-0000000000a1", null),
  transaction_b: side("00000000-0000-0000-0000-0000000000b1", "Zelle payment from Jane"),
  date_diff_days: 0,
  property_match: true,
  confidence: "high",
};

interface FakeServer {
  merges: unknown[];
  refuse: boolean;
}

async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { merges: [], refuse: true };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await stubTransactionPages(page, []);
  await page.route(/\/api\/transactions\/duplicates(\?|$)/, (route) =>
    route.fulfill(json({ pairs: [PAIR], total: 1 })),
  );
  await page.route("**/api/transactions/duplicates/merge", async (route, request: Request) => {
    server.merges.push(request.postDataJSON());
    if (server.refuse) {
      await route.fulfill(json({ detail: REASON }, 409));
      return;
    }
    await route.fulfill(json({ merged: true, surviving_id: PAIR.transaction_b.id }));
  });
  return server;
}

async function confirmMerge(page: Page) {
  await page.goto("/transactions");
  await page.getByRole("button", { name: /^Duplicates/ }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Merge" }).click();
}

test.describe("Duplicates: a refused merge", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  test("says why when the two are linked to different tenants", async ({ page }) => {
    await confirmMerge(page);

    await expect(notifications(page).getByText(REASON)).toBeVisible();
    await expect(notifications(page).getByText("Failed to merge transactions")).toHaveCount(0);
    expect(server.merges).toHaveLength(1);
  });

  test("a merge that goes through still says so", async ({ page }) => {
    server.refuse = false;
    await confirmMerge(page);

    await expect(notifications(page).getByText("Transactions merged successfully")).toBeVisible();
  });
});
