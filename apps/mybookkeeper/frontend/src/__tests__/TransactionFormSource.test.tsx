import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import TransactionForm from "@/app/features/transactions/TransactionForm";
import api from "@/shared/lib/api";

vi.mock("@mybookkeeper/api-client/store/vendorsApi", () => ({
  useGetVendorsQuery: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock("@/shared/lib/api", () => ({ default: { get: vi.fn() } }));

const FLAGGED = {
  id: "00000000-0000-0000-0000-000000000002",
  vendor: "Roofer",
  amount: "420.00",
  transaction_type: "expense",
  category: "maintenance",
  transaction_date: "2026-02-20",
  status: "needs_review",
  review_reason: "I couldn't tell which property this is for.",
  source_document_id: "00000000-0000-0000-0000-0000000000d1",
  source_file_name: "roof-receipt.png",
  tags: [],
} as unknown as Transaction;

const MANUAL = {
  ...FLAGGED,
  status: "pending",
  source_document_id: null,
  source_file_name: null,
} as unknown as Transaction;

function renderForm(transaction: Transaction) {
  const { result } = renderHook(() => useForm<TransactionFormValues>());
  const form = result.current;
  render(
    <TransactionForm
      transaction={transaction}
      properties={[]}
      register={form.register}
      watch={form.watch}
      setValue={form.setValue}
      dirtyFields={{}}
      onSubmit={vi.fn()}
      dupOther={null}
    />,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  URL.createObjectURL = vi.fn(() => "blob:source");
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe("TransactionForm source document and review reason", () => {
  it("shows why a flagged transaction needs review", () => {
    renderForm(FLAGGED);
    expect(screen.getByText("I couldn't tell which property this is for.")).toBeInTheDocument();
  });

  it("hides the review reason once the transaction is no longer flagged", () => {
    renderForm({ ...FLAGGED, status: "approved" } as Transaction);
    expect(screen.queryByText("I couldn't tell which property this is for.")).not.toBeInTheDocument();
  });

  it("opens the source document as an image", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(["png"]), headers: { "content-type": "image/png" } });
    renderForm(FLAGGED);

    await userEvent.click(screen.getByRole("button", { name: "Open source document roof-receipt.png" }));

    expect(api.get).toHaveBeenCalledWith(`/documents/${FLAGGED.source_document_id}/download`, { responseType: "blob" });
    expect(await screen.findByRole("img", { name: "Source document" })).toHaveAttribute("src", "blob:source");
  });

  it("has no source document link without a source document", () => {
    renderForm(MANUAL);
    expect(screen.queryByRole("button", { name: /open source document/i })).not.toBeInTheDocument();
  });
});
