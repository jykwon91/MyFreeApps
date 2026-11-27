import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TransactionPropertySplitSection from "@/app/features/transactions/TransactionPropertySplitSection";
import SplitWaysBadge from "@/app/features/transactions/SplitWaysBadge";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionPropertySplit } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplit";

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useSetPropertySplitMutation: vi.fn(),
  useRemovePropertySplitMutation: vi.fn(),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { showError, showSuccess } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useRemovePropertySplitMutation, useSetPropertySplitMutation } from "@mybookkeeper/api-client/store/transactionsApi";

const HOUSES = [
  { id: "p1", name: "6732 Peerless" },
  { id: "p2", name: "6734 Peerless" },
  { id: "p3", name: "6738 Peerless" },
] as Property[];

const EVEN: TransactionPropertySplit[] = [
  { property_id: "p1", amount: "33.34" },
  { property_id: "p2", amount: "33.33" },
  { property_id: "p3", amount: "33.33" },
];

let setTrigger: ReturnType<typeof vi.fn>;
let removeTrigger: ReturnType<typeof vi.fn>;

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    amount: "100.00",
    status: "approved",
    transaction_type: "expense",
    transaction_scope: "rental",
    property_id: null,
    property_splits: [],
    ...overrides,
  } as Transaction;
}

function renderSection(transaction: Transaction, splits: TransactionPropertySplit[] = [], onSplitsChange = vi.fn()) {
  render(
    <TransactionPropertySplitSection transaction={transaction} properties={HOUSES} splits={splits} onSplitsChange={onSplitsChange} />,
  );
  return onSplitsChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  setTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ property_splits: EVEN }) }));
  removeTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ property_splits: [] }) }));
  vi.mocked(useSetPropertySplitMutation).mockReturnValue([setTrigger, { isLoading: false }] as unknown as ReturnType<
    typeof useSetPropertySplitMutation
  >);
  vi.mocked(useRemovePropertySplitMutation).mockReturnValue([removeTrigger, { isLoading: false }] as unknown as ReturnType<
    typeof useRemovePropertySplitMutation
  >);
});

describe("TransactionPropertySplitSection", () => {
  it("splits evenly across the ticked properties and saves", async () => {
    const onSplitsChange = renderSection(txn());
    fireEvent.click(screen.getByRole("button", { name: "Split across properties" }));

    const save = screen.getByRole("button", { name: "Save split" });
    expect(save).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Tick at least two properties.");

    for (const house of HOUSES) fireEvent.click(screen.getByRole("checkbox", { name: `Include ${house.name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Split evenly" }));

    expect(screen.getByRole("textbox", { name: "Amount for 6732 Peerless" })).toHaveValue("33.34");
    expect(screen.getByRole("textbox", { name: "Amount for 6738 Peerless" })).toHaveValue("33.33");
    expect(screen.getByRole("status")).toHaveTextContent("$100.00 of $100.00 assigned");

    fireEvent.click(save);
    await waitFor(() =>
      expect(setTrigger).toHaveBeenCalledWith({
        id: "txn-1",
        data: {
          shares: [
            { property_id: "p1", amount: "33.34" },
            { property_id: "p2", amount: "33.33" },
            { property_id: "p3", amount: "33.33" },
          ],
        },
      }),
    );
    expect(onSplitsChange).toHaveBeenCalledWith(EVEN);
    expect(showSuccess).toHaveBeenCalledWith("Got it. I split it 3 ways.");
  });

  it("won't save uneven shares until they add up", () => {
    renderSection(txn());
    fireEvent.click(screen.getByRole("button", { name: "Split across properties" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Amount for 6732 Peerless" }), { target: { value: "70" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount for 6734 Peerless" }), { target: { value: "20" } });

    expect(screen.getByRole("status")).toHaveTextContent("$10.00 left to assign");
    expect(screen.getByRole("button", { name: "Save split" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Amount for 6734 Peerless" }), { target: { value: "30" } });
    expect(screen.getByRole("button", { name: "Save split" })).toBeEnabled();
  });

  it("shows the shares of a split and removes it", async () => {
    const onSplitsChange = renderSection(txn({ property_splits: EVEN }), EVEN);

    expect(screen.getByText("Split across 3 properties")).toBeInTheDocument();
    expect(screen.getByText("6732 Peerless")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove split" }));

    await waitFor(() => expect(removeTrigger).toHaveBeenCalledWith("txn-1"));
    expect(onSplitsChange).toHaveBeenCalledWith([]);
  });

  it("says when the server refuses a split", async () => {
    setTrigger.mockReturnValue({ unwrap: () => Promise.reject(new Error("no")) });
    renderSection(txn(), EVEN);
    fireEvent.click(screen.getByRole("button", { name: "Change split" }));
    fireEvent.click(screen.getByRole("button", { name: "Save split" }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.getByTestId("property-split-editor")).toBeInTheDocument();
  });

  it("isn't offered for a transfer, personal money, or a read-only member", () => {
    const { unmount } = render(
      <TransactionPropertySplitSection transaction={txn({ transaction_type: "transfer" })} properties={HOUSES} splits={[]} onSplitsChange={vi.fn()} />,
    );
    expect(screen.queryByTestId("property-split-section")).not.toBeInTheDocument();
    unmount();

    renderSection(txn({ transaction_scope: "personal" }));
    expect(screen.queryByTestId("property-split-section")).not.toBeInTheDocument();

    vi.mocked(useCanWrite).mockReturnValue(false);
    renderSection(txn(), EVEN);
    expect(screen.queryByTestId("property-split-section")).not.toBeInTheDocument();
  });
});

describe("SplitWaysBadge", () => {
  it("names the shares for screen readers", () => {
    render(<SplitWaysBadge ways={3} detail="6732 Peerless $33.34" />);
    expect(screen.getByTestId("split-ways-badge")).toHaveTextContent("Split 3 ways");
    expect(screen.getByLabelText("Split 3 ways: 6732 Peerless $33.34")).toBeInTheDocument();
  });
});
