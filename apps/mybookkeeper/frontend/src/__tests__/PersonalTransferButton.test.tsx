import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PersonalTransferButton from "@/app/features/personal-transfer/PersonalTransferButton";
import { usePersonalTransferActions } from "@/app/features/personal-transfer/usePersonalTransferActions";
import type { ToastAction } from "@platform/ui/types/toast-action";

vi.mock("@mybookkeeper/api-client/store/personalTransferApi", () => ({
  useMarkPersonalTransferMutation: vi.fn(),
  useUnmarkPersonalTransferMutation: vi.fn(),
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { showError, showSuccess } from "@platform/ui";
import {
  useMarkPersonalTransferMutation,
  useUnmarkPersonalTransferMutation,
} from "@mybookkeeper/api-client/store/personalTransferApi";

let markTrigger: ReturnType<typeof vi.fn>;
let unmarkTrigger: ReturnType<typeof vi.fn>;

function setMark(isLoading: boolean) {
  vi.mocked(useMarkPersonalTransferMutation).mockReturnValue([
    markTrigger,
    { isLoading },
  ] as unknown as ReturnType<typeof useMarkPersonalTransferMutation>);
}

beforeEach(() => {
  vi.clearAllMocks();
  markTrigger = vi.fn(() => ({
    unwrap: () =>
      Promise.resolve({
        transaction_id: "txn-1",
        remembered_sender: { id: "s1", display_name: "Dao Nguyen", payer_handle: "" },
        also_cleared: 3,
      }),
  }));
  unmarkTrigger = vi.fn(() => ({
    unwrap: () => Promise.resolve({ transaction_id: "txn-1", status: "pending", back_in_review: true, forgotten_senders: 1 }),
  }));
  setMark(false);
  vi.mocked(useUnmarkPersonalTransferMutation).mockReturnValue([
    unmarkTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useUnmarkPersonalTransferMutation>);
});

/** The card's wiring: the hook owns the mark, the button shows it. */
function MarkHarness({ transactionId }: { transactionId: string }) {
  const { mark, isMarking } = usePersonalTransferActions();
  return <PersonalTransferButton onMark={() => void mark(transactionId)} isMarking={isMarking} />;
}

describe("PersonalTransferButton", () => {
  it("marks the payment and says how many more it cleared", async () => {
    render(<MarkHarness transactionId="txn-1" />);
    fireEvent.click(screen.getByRole("button", { name: /personal transfer/i }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(markTrigger).toHaveBeenCalledWith("txn-1");
    expect(vi.mocked(showSuccess).mock.calls[0]?.[0]).toBe(
      "Marked as a personal transfer. I'll skip Dao Nguyen's payments from now on. I also cleared 3 more payments from them.",
    );
  });

  it("offers an Undo that takes back the mark and the remembered sender", async () => {
    render(<MarkHarness transactionId="txn-1" />);
    fireEvent.click(screen.getByRole("button", { name: /personal transfer/i }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const action = vi.mocked(showSuccess).mock.calls[0]?.[1] as ToastAction;
    expect(action.label).toBe("Undo");
    await action.onClick();
    expect(unmarkTrigger).toHaveBeenCalledWith({ transaction_id: "txn-1", forget_sender: true });
    expect(showSuccess).toHaveBeenLastCalledWith(
      "Got it, that's not a personal transfer. It's back in Payment Review. I'll stop skipping that sender too.",
    );
  });

  it("says so when the mark fails", async () => {
    markTrigger = vi.fn(() => ({ unwrap: () => Promise.reject(new Error("boom")) }));
    setMark(false);
    render(<MarkHarness transactionId="txn-1" />);
    fireEvent.click(screen.getByRole("button", { name: /personal transfer/i }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("I couldn't mark that as a personal transfer. Want to try again?"));
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("shows it's working and can't be clicked twice", () => {
    setMark(true);
    render(<MarkHarness transactionId="txn-1" />);
    const button = screen.getByRole("button", { name: /marking/i });
    expect(button).toBeDisabled();
  });

  it("can be held by the card while another action runs", () => {
    const onMark = vi.fn();
    render(<PersonalTransferButton onMark={onMark} isMarking={false} disabled />);
    const button = screen.getByRole("button", { name: /personal transfer/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onMark).not.toHaveBeenCalled();
  });
});
