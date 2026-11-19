/**
 * No-backend E2E: "Load more" on the Pending Receipts page asks for one page at a time by offset, so every
 * open receipt can be reached. Before, the page asked once with the server's default limit and showed only
 * the first 100. The server refuses a limit above 500 with a 422, as the real endpoint does.
 * Runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const SERVER_LIMIT_CAP = 500;
const ROW_COUNT = 130;
const PAGE_SIZE = 25;

function receipt(n: number) {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    transaction_id: `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    applicant_id: "20000000-0000-0000-0000-000000000001",
    signed_lease_id: null,
    period_start_date: "2026-05-01",
    period_end_date: "2026-05-31",
    status: "pending",
    sent_at: null,
    sent_via_attachment_id: null,
    created_at: "2026-05-15T10:00:00Z",
    tenant_name: `Tenant ${n}`,
    amount: "1500.00",
    transaction_date: "2026-05-15",
    payer_name: null,
    payment_method: null,
    vendor: null,
    send_blocker: null,
    sent_from_other_gmail: null,
  };
}

const RECEIPTS = Array.from({ length: ROW_COUNT }, (_, i) => receipt(i + 1));

test("pending receipts: Load more reaches every open receipt, one page at a time", async ({ page }) => {
  const offsets: number[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/rent-receipts\/pending(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!(limit >= 1 && limit <= SERVER_LIMIT_CAP)) return route.fulfill(json({ detail: "limit out of range" }, 422));
    offsets.push(offset);
    return route.fulfill(
      json({
        items: RECEIPTS.slice(offset, offset + limit),
        total: ROW_COUNT,
        has_more: offset + limit < ROW_COUNT,
        pending_count: ROW_COUNT,
        gmail_state: "ready",
      }),
    );
  });

  await page.goto("/receipts");
  const row = (n: number) => page.getByText(`Tenant ${n}`, { exact: true });
  await expect(row(1)).toBeVisible();
  await expect(page.getByText(`${ROW_COUNT} receipts waiting to send`)).toBeVisible();

  for (let shown = PAGE_SIZE; shown < ROW_COUNT; shown += PAGE_SIZE) {
    await page.getByTestId("load-more-button").click();
    await expect(row(Math.min(shown + PAGE_SIZE, ROW_COUNT))).toBeVisible();
  }

  await expect(page.getByTestId("pending-receipt-row")).toHaveCount(ROW_COUNT);
  await expect(page.getByTestId("load-more-button")).toHaveCount(0);
  await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  expect(offsets).toEqual([0, 25, 50, 75, 100, 125]);
});
