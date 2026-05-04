import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import PendingReceipts from "@/app/pages/PendingReceipts";
import type { PendingReceiptListResponse } from "@/shared/types/lease/pending-receipt";

vi.mock("@/shared/store/rentReceiptsApi", () => ({
  useGetPendingReceiptsQuery: vi.fn(),
  useDismissReceiptMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/transactionsApi", () => ({
  useGetTransactionQuery: vi.fn(),
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

import { useGetPendingReceiptsQuery } from "@/shared/store/rentReceiptsApi";
import { useGetTransactionQuery } from "@/shared/store/transactionsApi";

const mockTransaction = {
  id: "txn-123",
  transaction_date: "2026-05-15",
  amount: "1500.00",
  vendor: "Chase Bank",
  payer_name: "Alice Johnson",
  description: "Rent payment",
  category: "income",
  transaction_type: "income",
  payment_method: "check",
  status: "approved",
};

const pendingResponse: PendingReceiptListResponse = {
  items: [
    {
      id: "receipt-1",
      user_id: "user-1",
      organization_id: "org-1",
      transaction_id: "txn-123",
      applicant_id: "app-1",
      signed_lease_id: "lease-1",
      period_start_date: "2026-05-01",
      period_end_date: "2026-05-31",
      status: "pending",
      sent_at: null,
      sent_via_attachment_id: null,
      created_at: "2026-05-15T10:00:00Z",
      updated_at: "2026-05-15T10:00:00Z",
      deleted_at: null,
    },
  ],
  total: 1,
  pending_count: 1,
};

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
    vi.mocked(useGetTransactionQuery).mockReturnValue({
      data: mockTransaction as unknown as ReturnType<typeof useGetTransactionQuery>["data"],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetTransactionQuery>);
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
      data: { items: [], total: 0, pending_count: 0 },
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
    expect(screen.getByTestId("pending-receipt-row")).toBeInTheDocument();
    expect(screen.getByTestId("pending-receipt-dismiss-btn")).toBeInTheDocument();
    expect(screen.getByTestId("pending-receipt-send-btn")).toBeInTheDocument();
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
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText(/couldn't load pending receipts/i)).toBeInTheDocument();
  });

  it("shows pending count in subtitle when receipts exist", () => {
    vi.mocked(useGetPendingReceiptsQuery).mockReturnValue({
      data: pendingResponse,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetPendingReceiptsQuery>);

    renderPage();
    expect(screen.getByText(/1 receipt ready to send/i)).toBeInTheDocument();
  });
});
