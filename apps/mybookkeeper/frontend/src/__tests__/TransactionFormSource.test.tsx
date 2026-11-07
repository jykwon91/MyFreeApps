import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import TransactionForm from "@/app/features/transactions/TransactionForm";
import api from "@/shared/lib/api";
import { showError } from "@platform/ui";
import { TRANSACTION_EDIT_MESSAGES } from "@/shared/lib/transaction-edit-messages";

vi.mock("@mybookkeeper/api-client/store/vendorsApi", () => ({
  useGetVendorsQuery: () => ({ data: { items: [] }, isLoading: false }),
}));

vi.mock("@/shared/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

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

// StrictMode, as in main.tsx, mounts each component twice in development.
function renderForm(transaction: Transaction) {
  const { result } = renderHook(() => useForm<TransactionFormValues>());
  const form = result.current;
  render(
    <StrictMode>
    <TransactionForm
      transaction={transaction}
      properties={[]}
      register={form.register}
      watch={form.watch}
      setValue={form.setValue}
      dirtyFields={{}}
      onSubmit={vi.fn()}
      dupOther={null}
    />
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(showError).mockReset();
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
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }) });
    renderForm(FLAGGED);

    await userEvent.click(screen.getByRole("button", { name: "Open source document roof-receipt.png" }));

    expect(api.get).toHaveBeenCalledWith(`/documents/${FLAGGED.source_document_id}/download`, { responseType: "blob" });
    expect(await screen.findByRole("img", { name: "Source document" })).toHaveAttribute("src", "blob:source");
  });

  it("shows it's opening the source document and ignores a second click until it opens", async () => {
    let resolve!: (value: { data: Blob }) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderForm(FLAGGED);
    const button = screen.getByRole("button", { name: "Open source document roof-receipt.png" });

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(TRANSACTION_EDIT_MESSAGES.openingSource);
    await userEvent.click(button);
    expect(api.get).toHaveBeenCalledTimes(1);

    resolve({ data: new Blob(["png"], { type: "image/png" }) });
    expect(await screen.findByRole("img", { name: "Source document" })).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("opens a PDF source document as a PDF", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob(["%PDF"], { type: "application/pdf" }) });
    renderForm(FLAGGED);

    await userEvent.click(screen.getByRole("button", { name: "Open source document roof-receipt.png" }));

    expect(await screen.findByTitle("Source document")).toHaveAttribute("src", "blob:source");
    expect(screen.queryByRole("img", { name: "Source document" })).not.toBeInTheDocument();
  });

  it("throws away a download that finishes after the panel closed, without a toast", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    let resolve!: (value: { data: Blob }) => void;
    renderForm(FLAGGED);
    await userEvent.click(screen.getByRole("button", { name: "Open source document roof-receipt.png" }));
    cleanup();
    reject(new Error("404"));
    await new Promise((r) => setTimeout(r, 0));
    expect(showError).not.toHaveBeenCalled();

    vi.mocked(api.get).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderForm(FLAGGED);
    await userEvent.click(screen.getByRole("button", { name: "Open source document roof-receipt.png" }));
    cleanup();
    resolve({ data: new Blob(["png"], { type: "image/png" }) });
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source"));
  });

  it("says so when the source document can't be opened", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("404"));
    renderForm(FLAGGED);
    const button = screen.getByRole("button", { name: "Open source document roof-receipt.png" });

    await userEvent.click(button);

    await waitFor(() => expect(showError).toHaveBeenCalledWith(TRANSACTION_EDIT_MESSAGES.couldntOpenSource));
    expect(screen.queryByRole("img", { name: "Source document" })).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-disabled", "false");
  });

  it("has no source document link without a source document", () => {
    renderForm(MANUAL);
    expect(screen.queryByRole("button", { name: /open source document/i })).not.toBeInTheDocument();
  });
});
