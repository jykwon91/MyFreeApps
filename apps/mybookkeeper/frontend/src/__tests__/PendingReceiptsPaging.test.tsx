/**
 * Against the real RTK Query hook and a server stub that refuses a limit above its cap: the Pending Receipts
 * page loads past the first page one page at a time, keeps its rows through a failed "Load more" (whose Retry
 * asks for that page again), and takes a receipt dismissed from a later page off the list.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PendingReceipts from "@/app/pages/PendingReceipts";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { PendingReceiptListResponse } from "@mybookkeeper/api-client/types/lease/pending-receipt-list-response";
import { restoreApi, stubApi } from "@/test/api-stub";
import { answerListPage, SERVER_LIMIT_CAP } from "@/test/paged-list-server";
import { renderWithStore } from "@/test/render-with-store";

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const PAGE_SIZE = 25;
/** More receipts than the server answers in one request, so reaching the last needs offset paging. */
const ROW_COUNT = SERVER_LIMIT_CAP + 30;

function receipt(index: number): PendingReceipt {
  return {
    id: `r-${index}`,
    transaction_id: `tx-${index}`,
    applicant_id: `a-${index}`,
    signed_lease_id: null,
    period_start_date: "2026-05-01",
    period_end_date: "2026-05-31",
    status: "pending",
    sent_at: null,
    sent_via_attachment_id: null,
    created_at: "2026-05-15T10:00:00Z",
    tenant_name: `Tenant ${index}`,
    amount: "1500.00",
    transaction_date: "2026-05-15",
    payer_name: null,
    payment_method: null,
    vendor: null,
    send_blocker: null,
    sent_from_other_gmail: null,
  };
}

function answerPending(rows: readonly PendingReceipt[], params: Readonly<Record<string, unknown>>): PendingReceiptListResponse {
  const page = answerListPage(rows, params);
  return { ...page, pending_count: page.total, gmail_state: "ready" };
}

async function expectRow(name: string): Promise<void> {
  expect(await screen.findByText(name, { exact: true })).toBeInTheDocument();
}

async function clickLoadMore(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
}

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("Pending receipts paging", () => {
  it("loads past the server's limit cap one page at a time, until the last receipt", async () => {
    const rows = Array.from({ length: ROW_COUNT }, (_, i) => receipt(i + 1));
    const requests: Array<Readonly<Record<string, unknown>>> = [];
    stubApi((path, params) => {
      if (path !== "/rent-receipts/pending") throw new Error(`unexpected ${path}`);
      requests.push(params);
      return answerPending(rows, params);
    });
    cleanup = renderWithStore(<PendingReceipts />, "/receipts");
    await expectRow("Tenant 1");
    expect(screen.getByText(`${ROW_COUNT} receipts waiting to send`)).toBeInTheDocument();
    expect(screen.queryByText(`Tenant ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    for (let shown = PAGE_SIZE; shown < ROW_COUNT; shown += PAGE_SIZE) {
      await clickLoadMore();
      await expectRow(`Tenant ${Math.min(shown + PAGE_SIZE, ROW_COUNT)}`);
    }

    expect(screen.getAllByTestId("pending-receipt-row")).toHaveLength(ROW_COUNT);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(requests.map((params) => Number(params.offset))).toEqual([0, 25, 50, 75, 100, 125]);
    expect(requests.every((params) => Number(params.limit) === PAGE_SIZE)).toBe(true);
  });

  it("keeps its receipts when 'Load more' fails, and Retry loads that page", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => receipt(i + 1));
    let failSecondPage = true;
    stubApi((path, params) => {
      if (Number(params.offset) === PAGE_SIZE && failSecondPage) {
        failSecondPage = false;
        throw new Error("server down");
      }
      return answerPending(rows, params);
    });
    cleanup = renderWithStore(<PendingReceipts />, "/receipts");
    await expectRow("Tenant 1");

    await clickLoadMore();

    expect(await screen.findByText("I couldn't load more pending receipts. Want me to try again?")).toBeInTheDocument();
    await expectRow("Tenant 1");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await expectRow(`Tenant ${PAGE_SIZE + 1}`);
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });

  it("takes a receipt dismissed from the second page off the list, and keeps the rest", async () => {
    let rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => receipt(i + 1));
    const target = `Tenant ${PAGE_SIZE + 3}`;
    stubApi((path, params) => {
      if (path === `/rent-receipts/tx-${PAGE_SIZE + 3}/dismiss`) {
        rows = rows.filter((row) => row.transaction_id !== `tx-${PAGE_SIZE + 3}`);
        return null;
      }
      return answerPending(rows, params);
    });
    cleanup = renderWithStore(<PendingReceipts />, "/receipts");
    await expectRow("Tenant 1");
    await clickLoadMore();
    await expectRow(target);

    const row = screen.getByText(target, { exact: true }).closest<HTMLElement>("[data-testid='pending-receipt-row']");
    if (!row) throw new Error("row not found");
    await userEvent.click(within(row).getByTestId("pending-receipt-dismiss-btn"));

    await screen.findByText(`${PAGE_SIZE + 4} receipts waiting to send`);
    expect(screen.queryByText(target, { exact: true })).not.toBeInTheDocument();
    await expectRow(`Tenant ${PAGE_SIZE + 5}`);
    await expectRow("Tenant 1");
  });
});
