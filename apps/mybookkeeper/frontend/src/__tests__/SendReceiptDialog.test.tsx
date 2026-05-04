import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import SendReceiptDialog from "@/app/features/receipts/SendReceiptDialog";
import type { Transaction } from "@/shared/types/transaction/transaction";

const mockSendReceipt = vi.fn();

vi.mock("@/shared/store/rentReceiptsApi", () => ({
  useSendReceiptMutation: vi.fn(() => [mockSendReceipt, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { showSuccess, showError } from "@/shared/lib/toast-store";

const mockTransaction = {
  id: "txn-123",
  transaction_date: "2026-05-15",
  amount: "1500.00",
  vendor: "Chase Bank",
  payer_name: "Alice Johnson",
  description: "Rent payment",
  category: "income",
  transaction_type: "income",
  tax_relevant: false,
  payment_method: "check",
  property_id: null,
  applicant_id: "app-456",
  attribution_source: "auto_exact",
  channel: null,
  tax_year: 2026,
  status: "approved",
  is_manual: false,
  created_at: "2026-05-15T10:00:00Z",
  updated_at: "2026-05-15T10:00:00Z",
  vendor_id: null,
} as unknown as Transaction;

function renderDialog(onClose = vi.fn()) {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <SendReceiptDialog transaction={mockTransaction} onClose={onClose} />
      </BrowserRouter>
    </Provider>,
  );
}

describe("SendReceiptDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with dialog role and correct aria label", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Send rent receipt" })).toBeInTheDocument();
  });

  it("shows the transaction amount in the header", () => {
    renderDialog();
    expect(screen.getByText(/\$1,500\.00/)).toBeInTheDocument();
  });

  it("pre-fills period start and end from the transaction month", () => {
    renderDialog();
    const startInput = screen.getByTestId("receipt-period-start") as HTMLInputElement;
    const endInput = screen.getByTestId("receipt-period-end") as HTMLInputElement;
    // Transaction date is 2026-05-15 → month is May → start=2026-05-01, end=2026-05-31
    expect(startInput.value).toBe("2026-05-01");
    expect(endInput.value).toBe("2026-05-31");
  });

  it("pre-fills payment method from transaction", () => {
    renderDialog();
    const select = screen.getByTestId("receipt-payment-method") as HTMLSelectElement;
    expect(select.value).toBe("check");
  });

  it("shows Preview PDF button", () => {
    renderDialog();
    expect(screen.getByTestId("receipt-preview-btn")).toBeInTheDocument();
  });

  it("shows cancel and send buttons", () => {
    renderDialog();
    expect(screen.getByTestId("receipt-cancel-btn")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-send-btn")).toBeInTheDocument();
  });

  it("calls onClose with no argument when cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("receipt-cancel-btn"));
    expect(onClose).toHaveBeenCalledWith();
  });

  it("calls sendReceipt mutation and shows success toast on send", async () => {
    // sendReceipt returns an object with .unwrap() per RTK Query pattern
    mockSendReceipt.mockReturnValue({
      unwrap: () => Promise.resolve({ receipt_number: "R-2026-0001", attachment_id: "att-1" }),
    });

    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Receipt R-2026-0001 sent.");
    });
    expect(onClose).toHaveBeenCalledWith("R-2026-0001");
  });

  it("shows generic error toast when send fails", async () => {
    mockSendReceipt.mockReturnValue({
      unwrap: () => Promise.reject({ data: {} }),
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Couldn't send the receipt. Please try again.",
      );
    });
  });

  it("shows gmail reauth error for gmail_reauth_required detail", async () => {
    mockSendReceipt.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: "gmail_reauth_required" } }),
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        expect.stringContaining("Gmail needs to be reconnected"),
      );
    });
  });

  it("sets preview iframe src after clicking Preview PDF", async () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-preview-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("receipt-preview-iframe")).toBeInTheDocument();
    });

    const iframe = screen.getByTestId("receipt-preview-iframe") as HTMLIFrameElement;
    expect(iframe.src).toContain("/api/rent-receipts/preview/txn-123");
    expect(iframe.src).toContain("period_start=2026-05-01");
    expect(iframe.src).toContain("period_end=2026-05-31");
  });
});
