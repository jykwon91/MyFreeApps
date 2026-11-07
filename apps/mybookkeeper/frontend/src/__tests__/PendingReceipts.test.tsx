import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import PendingReceipts from "@/app/pages/PendingReceipts";
import type { PendingReceiptListResponse } from "@mybookkeeper/api-client/types/lease/pending-receipt-list-response";

vi.mock("@mybookkeeper/api-client/store/rentReceiptsApi", () => ({
  useGetPendingReceiptsQuery: vi.fn(),
  useDismissReceiptMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/app/features/receipts/SendReceiptDialog", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-send-receipt-dialog">
      <button onClick={() => onClose()}>Close dialog</button>
    </div>
  ),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useDismissReceiptMutation, useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { queryStatus } from "@/test/rtk-query-status";

const pendingResponse: PendingReceiptListResponse = {
  items: [
    {
      id: "receipt-1",
      transaction_id: "txn-123",
      applicant_id: "app-1",
      signed_lease_id: "lease-1",
      period_start_date: "2026-05-01",
      period_end_date: "2026-05-31",
      status: "pending",
      sent_at: null,
      sent_via_attachment_id: null,
      created_at: "2026-05-15T10:00:00Z",
      tenant_name: "Alice Johnson",
      amount: "1500.00",
      transaction_date: "2026-05-15",
      payer_name: "A JOHNSON",
      payment_method: "check",
      vendor: "Chase Bank",
      send_blocker: null,
      sent_from_other_gmail: null,
    },
  ],
  total: 1,
  pending_count: 1,
  gmail_state: "ready",
};

function mockList(data: PendingReceiptListResponse) {
  vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);
}

function renderPage() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <PendingReceipts />
      </BrowserRouter>
    </Provider>,
  );
}

describe("PendingReceipts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getAllByTestId("pending-receipt-row-skeleton").length).toBeGreaterThan(0);
  });

  it("shows empty state when no pending receipts", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: { items: [], total: 0, pending_count: 0, gmail_state: "ready" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText(/queue a receipt/i)).toBeInTheDocument();
  });

  it("shows pending receipt rows", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: pendingResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    const row = screen.getByTestId("pending-receipt-row");
    expect(row).toHaveTextContent("Alice Johnson");
    expect(row).toHaveTextContent("$1,500.00");
    expect(row).toHaveTextContent("2026-05-01 – 2026-05-31");
    expect(row).toHaveTextContent("Received 2026-05-15");
    expect(screen.getByTestId("pending-receipt-dismiss-btn")).toBeInTheDocument();
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeEnabled();
    expect(screen.queryByTestId("pending-receipt-blocker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-receipts-gmail-state")).not.toBeInTheDocument();
  });

  it("says why a receipt can't be sent and turns Send off for it", () => {
    mockList({
      ...pendingResponse,
      items: [{ ...pendingResponse.items[0], send_blocker: "no_lease" }],
    });

    renderPage();
    expect(screen.getByTestId("pending-receipt-blocker")).toHaveTextContent(/signed lease/i);
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeDisabled();
    expect(screen.getByTestId("pending-receipt-dismiss-btn")).toBeEnabled();
  });

  it("says a teammate's tenant is theirs to send, naming the payer instead", () => {
    mockList({
      ...pendingResponse,
      items: [
        { ...pendingResponse.items[0], tenant_name: null, send_blocker: "tenant_of_other_member" },
      ],
    });

    renderPage();
    expect(screen.getByText("A JOHNSON")).toBeInTheDocument();
    expect(screen.getByTestId("pending-receipt-blocker")).toHaveTextContent(/only they can send/i);
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeDisabled();
  });

  it("falls back to Tenant when there's no tenant or payer name", () => {
    mockList({
      ...pendingResponse,
      items: [{ ...pendingResponse.items[0], tenant_name: null, payer_name: null }],
    });

    renderPage();
    expect(screen.getByText("Tenant")).toBeInTheDocument();
  });

  it("turns every Send off while Gmail can't send, and links to Integrations", () => {
    mockList({ ...pendingResponse, gmail_state: "needs_send_permission" });

    renderPage();
    expect(screen.getByTestId("pending-receipts-gmail-state")).toHaveTextContent(/not allowed to send/i);
    expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute("href", "/integrations");
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeDisabled();
  });

  it("marks a send Gmail hasn't confirmed and hides Dismiss on it", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: {
        ...pendingResponse,
        items: [{ ...pendingResponse.items[0], status: "sending" }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByTestId("pending-receipt-confirming")).toHaveTextContent("Confirming with Gmail");
    expect(screen.queryByTestId("pending-receipt-dismiss-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeInTheDocument();
  });

  it("lets me dismiss, after confirming, a send through a Gmail account that isn't connected", async () => {
    const dismiss = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
    vi.mocked(useDismissReceiptMutation).mockReturnValue([
      dismiss,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useDismissReceiptMutation>);
    mockList({
      ...pendingResponse,
      items: [{ ...pendingResponse.items[0], status: "sending", sent_from_other_gmail: "old@gmail.com" }],
    });

    renderPage();
    expect(screen.getByTestId("pending-receipt-other-gmail")).toHaveTextContent("Can't check with Gmail");
    expect(screen.getByTestId("pending-receipt-other-gmail-note")).toHaveTextContent(/gone out from old@gmail\.com,/);
    expect(screen.queryByTestId("pending-receipt-confirming")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-receipt-send-btn")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pending-receipt-dismiss-btn"));
    expect(dismiss).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("dialog", { name: "Dismiss this receipt?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ transaction_id: "txn-123" }));
  });

  it("shows no confirming pill on a pending row", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: pendingResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.queryByTestId("pending-receipt-confirming")).not.toBeInTheDocument();
  });

  it("shows send dialog when Review & send is clicked", async () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: pendingResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    fireEvent.click(screen.getByTestId("pending-receipt-send-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-send-receipt-dialog")).toBeInTheDocument();
    });
  });

  it("shows error alert on fetch failure", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      ...queryStatus({ failed: true, fetching: false }),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText(/couldn't load pending receipts/i)).toBeInTheDocument();
  });

  it("keeps the error, not the empty state, while Retry refetches", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      ...queryStatus({ failed: true, fetching: true }),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText(/couldn't load pending receipts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByText(/I'll queue a receipt here/)).not.toBeInTheDocument();
  });

  it("counts every open receipt in the subtitle as waiting, not ready", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: pendingResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText("1 receipt waiting to send")).toBeInTheDocument();
  });
});
