import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import SendReceiptDialog from "@/app/features/receipts/SendReceiptDialog";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";

const mockSendReceipt = vi.fn();

vi.mock("@mybookkeeper/api-client/store/rentReceiptsApi", () => ({
  useSendReceiptMutation: vi.fn(() => [mockSendReceipt, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockApiGet = vi.fn();
vi.mock("@/shared/lib/api", () => ({
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import { showSuccess, showError } from "@/shared/lib/toast-store";

// A lease-set period that isn't a calendar month: the dialog must keep it.
const mockReceipt: PendingReceipt = {
  id: "receipt-1",
  transaction_id: "txn-123",
  applicant_id: "app-456",
  signed_lease_id: "lease-1",
  period_start_date: "2026-05-10",
  period_end_date: "2026-06-09",
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
};

function renderDialog(onClose = vi.fn(), receipt: PendingReceipt = mockReceipt) {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <SendReceiptDialog receipt={receipt} onClose={onClose} />
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

  it("shows the amount and the tenant in the header", () => {
    renderDialog();
    expect(screen.getByText(/\$1,500\.00 from Alice Johnson/)).toBeInTheDocument();
  });

  it("names the payer from the payment when the tenant's name isn't known", () => {
    renderDialog(vi.fn(), { ...mockReceipt, tenant_name: null });
    expect(screen.getByText(/\$1,500\.00 from A JOHNSON/)).toBeInTheDocument();
  });

  it("pre-fills the period stored on the receipt, not the payment's calendar month", () => {
    renderDialog();
    const startInput = screen.getByTestId("receipt-period-start") as HTMLInputElement;
    const endInput = screen.getByTestId("receipt-period-end") as HTMLInputElement;
    expect(startInput.value).toBe("2026-05-10");
    expect(endInput.value).toBe("2026-06-09");
  });

  it("pre-fills the payment method from the payment", () => {
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

  it.each([
    ["receipt_already_sent", /already went out/, true],
    ["receipt_dismissed", /was dismissed/, true],
    ["receipt_send_in_progress", /won't email it twice/, false],
    ["receipt_send_unconfirmed", /check Gmail first/, false],
    ["receipt_sent_not_recorded", /couldn't save that it was sent/, false],
  ])("explains %s instead of showing the raw code", async (detail, message, closes) => {
    mockSendReceipt.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail } }),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(expect.stringMatching(message));
    });
    expect(showError).not.toHaveBeenCalledWith(detail);
    if (closes) {
      expect(onClose).toHaveBeenCalledWith();
    } else {
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  it("names the account a stuck send went through, says where to reconnect it, and closes", async () => {
    mockSendReceipt.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { detail: { code: "receipt_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" } },
        }),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        expect.stringMatching(/gone out from old@gmail\.com,.*Go to Integrations → Reconnect Gmail\.$/),
      );
    });
    expect(onClose).toHaveBeenCalledWith();
  });

  it("shows the server's sentence for a request it can't act on", async () => {
    const detail = "This tenant has no signed lease to file the receipt under. Add the lease, then send.";
    mockSendReceipt.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail } }),
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-send-btn"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(detail);
    });
  });

  it("fetches the preview PDF via the authenticated API and renders it as a blob URL", async () => {
    const fakeBlob = new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });
    mockApiGet.mockResolvedValueOnce({ data: fakeBlob });
    const objectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake-pdf-url");

    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-preview-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("receipt-preview-iframe")).toBeInTheDocument();
    });

    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining("/rent-receipts/preview/txn-123"),
      expect.objectContaining({ responseType: "blob" }),
    );
    const calledUrl = mockApiGet.mock.calls[0][0] as string;
    expect(calledUrl).toContain("period_start=2026-05-10");
    expect(calledUrl).toContain("period_end=2026-06-09");

    const iframe = screen.getByTestId("receipt-preview-iframe") as HTMLIFrameElement;
    expect(iframe.src).toBe("blob:fake-pdf-url");

    objectUrlSpy.mockRestore();
  });

  it("surfaces a preview error when the API fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("net err"));
    renderDialog();
    fireEvent.click(screen.getByTestId("receipt-preview-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("receipt-preview-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("receipt-preview-iframe")).not.toBeInTheDocument();
  });
});
