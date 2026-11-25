import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TransactionPersonalTransferSection from "@/app/features/personal-transfer/TransactionPersonalTransferSection";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";

vi.mock("@mybookkeeper/api-client/store/personalTransferApi", () => ({
  useMarkPersonalTransferMutation: vi.fn(),
  useUnmarkPersonalTransferMutation: vi.fn(),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { useCanWrite } from "@/shared/hooks/useOrgRole";
import {
  useMarkPersonalTransferMutation,
  useUnmarkPersonalTransferMutation,
} from "@mybookkeeper/api-client/store/personalTransferApi";

let markTrigger: ReturnType<typeof vi.fn>;
let unmarkTrigger: ReturnType<typeof vi.fn>;

function txn(status: TransactionStatus, payerName: string | null = "Dao Nguyen"): Transaction {
  return { id: "txn-1", status, payer_name: payerName } as Transaction;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  markTrigger = vi.fn(() => ({
    unwrap: () => Promise.resolve({ transaction_id: "txn-1", remembered_sender: null, also_cleared: 0 }),
  }));
  unmarkTrigger = vi.fn(() => ({
    unwrap: () => Promise.resolve({ transaction_id: "txn-1", status: "approved", back_in_review: false, forgotten_senders: 0 }),
  }));
  vi.mocked(useMarkPersonalTransferMutation).mockReturnValue([
    markTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useMarkPersonalTransferMutation>);
  vi.mocked(useUnmarkPersonalTransferMutation).mockReturnValue([
    unmarkTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useUnmarkPersonalTransferMutation>);
});

describe("TransactionPersonalTransferSection", () => {
  it("marks any counted transaction", async () => {
    render(<TransactionPersonalTransferSection transaction={txn("approved")} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as personal transfer" }));
    await waitFor(() => expect(markTrigger).toHaveBeenCalledWith("txn-1"));
  });

  it("un-marks and forgets the sender by default", async () => {
    render(<TransactionPersonalTransferSection transaction={txn("personal_transfer")} />);
    expect(screen.getByText("This is a personal transfer. It doesn't count towards any total.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Also stop skipping Dao Nguyen" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Not a personal transfer" }));
    await waitFor(() => expect(unmarkTrigger).toHaveBeenCalledWith({ transaction_id: "txn-1", forget_sender: true }));
  });

  it("keeps the sender when the box is unticked", async () => {
    render(<TransactionPersonalTransferSection transaction={txn("personal_transfer")} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Not a personal transfer" }));
    await waitFor(() => expect(unmarkTrigger).toHaveBeenCalledWith({ transaction_id: "txn-1", forget_sender: false }));
  });

  it("has no sender to forget when the payment named none", async () => {
    render(<TransactionPersonalTransferSection transaction={txn("personal_transfer", null)} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not a personal transfer" }));
    await waitFor(() => expect(unmarkTrigger).toHaveBeenCalledWith({ transaction_id: "txn-1", forget_sender: false }));
  });

  it("tells the panel the new status after a mark and an un-mark", async () => {
    const onStatusChange = vi.fn();
    const { rerender } = render(
      <TransactionPersonalTransferSection transaction={txn("approved")} onStatusChange={onStatusChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as personal transfer" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith("personal_transfer"));

    rerender(<TransactionPersonalTransferSection transaction={txn("personal_transfer")} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Not a personal transfer" }));
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith("approved"));
  });

  it("offers nothing on a duplicate or to a viewer", () => {
    const { container, rerender } = render(<TransactionPersonalTransferSection transaction={txn("duplicate")} />);
    expect(container).toBeEmptyDOMElement();
    vi.mocked(useCanWrite).mockReturnValue(false);
    rerender(<TransactionPersonalTransferSection transaction={txn("approved")} />);
    expect(container).toBeEmptyDOMElement();
  });
});
