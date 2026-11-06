import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { UseFormRegister } from "react-hook-form";
import { store } from "@/shared/store";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import DrillDownPanel from "@/app/features/dashboard/DrillDownPanel";
import { TRANSACTION_EDIT_MESSAGES as MSG } from "@/shared/lib/transaction-edit-messages";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";

const updateUnwrap = vi.fn();
const updateTransaction = vi.fn(() => ({ unwrap: updateUnwrap }));
const deleteUnwrap = vi.fn();
const deleteTransaction = vi.fn(() => ({ unwrap: deleteUnwrap }));
let isSaving = false;

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useListTransactionsQuery: vi.fn(),
  useUpdateTransactionMutation: () => [updateTransaction, { isLoading: isSaving }],
  useDeleteTransactionMutation: () => [deleteTransaction, { isLoading: false }],
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

// The real form pulls vendors, previews and duplicates; these tests are about
// closing and saving, so one registered field is enough.
vi.mock("@/app/features/transactions/TransactionForm", () => ({
  default: ({ register, onSubmit }: { register: UseFormRegister<TransactionFormValues>; onSubmit: () => void }) => (
    <form id="transaction-panel-form" onSubmit={onSubmit}>
      <input aria-label="Vendor" {...register("vendor")} />
    </form>
  ),
}));

const showError = vi.fn();
vi.mock("@/shared/lib/toast-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/toast-store")>()),
  showError: (msg: string) => showError(msg),
}));

import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";

const TXN = {
  id: "00000000-0000-0000-0000-000000000001",
  vendor: "Test Plumber",
  vendor_id: null,
  description: null,
  amount: "500.00",
  transaction_type: "expense",
  category: "contract_work",
  property_id: null,
  tax_relevant: true,
  payment_method: null,
  channel: null,
  transaction_date: "2024-06-15",
  tax_year: 2024,
  status: "approved",
  is_manual: false,
  created_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
} as unknown as Transaction;

function renderPanel(onClose = vi.fn(), transaction: Transaction = TXN) {
  render(
    <Provider store={store}>
      <TransactionPanel transaction={transaction} properties={[]} onClose={onClose} />
    </Provider>,
  );
  return onClose;
}

async function editVendor() {
  const input = screen.getByRole("textbox", { name: "Vendor" });
  await userEvent.clear(input);
  await userEvent.type(input, "New Plumber");
  return input;
}

function unsavedDialog() {
  return screen.queryByTestId("unsaved-changes-dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  isSaving = false;
  updateUnwrap.mockResolvedValue({ retroactive_count: 0 });
});

describe("TransactionPanel unsaved changes", () => {
  it("closes straight away when nothing was edited", async () => {
    const onClose = renderPanel();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(unsavedDialog()).toBeNull();
  });

  it("asks before closing, starts on Keep editing, and Escape keeps the edits", async () => {
    const onClose = renderPanel();
    const input = await editVendor();

    await userEvent.keyboard("{Escape}");
    const dialog = screen.getByRole("alertdialog", { name: MSG.unsavedTitle });
    expect(within(dialog).getByRole("button", { name: MSG.keepEditing })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(unsavedDialog()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(input).toHaveValue("New Plumber");
  });

  it("Keep editing goes back to the form with the edits", async () => {
    const onClose = renderPanel();
    const input = await editVendor();
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));

    await userEvent.click(screen.getByRole("button", { name: MSG.keepEditing }));
    expect(unsavedDialog()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(input).toHaveValue("New Plumber");
  });

  it("Discard closes without saving", async () => {
    const onClose = renderPanel();
    await editVendor();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: MSG.discard }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("Save & close saves only the edited field, then closes", async () => {
    const onClose = renderPanel();
    await editVendor();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: MSG.saveAndClose }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenCalledWith({ id: TXN.id, data: { vendor: "New Plumber" } });
  });

  it("a failed Save & close keeps the prompt open with an error, and retry works", async () => {
    const onClose = renderPanel();
    await editVendor();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    updateUnwrap.mockRejectedValueOnce({ status: 500 });

    await userEvent.click(screen.getByRole("button", { name: MSG.saveAndClose }));
    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(MSG.couldntSave);
    expect(showError).toHaveBeenCalledWith(MSG.couldntSave);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: MSG.saveAndClose }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("a double click on Save & close saves once and closes once", async () => {
    const onClose = renderPanel();
    await editVendor();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    let finishSave: (value: unknown) => void = () => {};
    updateUnwrap.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));

    const saveAndClose = screen.getByRole("button", { name: MSG.saveAndClose });
    fireEvent.click(saveAndClose);
    fireEvent.click(saveAndClose);
    fireEvent.click(screen.getByRole("button", { name: MSG.discard }));
    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1));
    finishSave({ retroactive_count: 0 });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenCalledTimes(1);
  });

  it("while saving, the prompt's buttons are disabled and Escape doesn't dismiss it", async () => {
    isSaving = true;
    const onClose = renderPanel();
    await editVendor();
    await userEvent.keyboard("{Escape}");
    const dialog = screen.getByRole("alertdialog");

    for (const name of [MSG.discard, MSG.keepEditing]) {
      expect(within(dialog).getByRole("button", { name })).toBeDisabled();
    }
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the browser warns before leaving only while there are unsaved edits", async () => {
    renderPanel();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);

    await editVendor();
    expect(leave()).toBe(true);

    cleanup();
    expect(leave()).toBe(false);
  });

  it("Save & Approve sends the edit with the approved status, and keeps the panel open if it fails", async () => {
    const pending = { ...TXN, status: "pending" } as Transaction;
    const onClose = renderPanel(vi.fn(), pending);
    await editVendor();
    updateUnwrap.mockRejectedValueOnce({ status: 500 });

    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.couldntSave));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenLastCalledWith({ id: TXN.id, data: { vendor: "New Plumber", status: "approved" } });
  });

  it("a failed delete says so and keeps the panel open", async () => {
    const onClose = renderPanel();
    deleteUnwrap.mockRejectedValueOnce({ status: 500 });

    await userEvent.click(screen.getByRole("button", { name: "Delete transaction" }));
    const confirm = screen.getByRole("dialog", { name: "Delete transaction" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.couldntDelete));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a failed Save keeps the panel open and says so", async () => {
    const onClose = renderPanel();
    await editVendor();
    updateUnwrap.mockRejectedValueOnce({ status: 500 });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.couldntSave));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DrillDownPanel with an edited transaction", () => {
  function renderDrillDown(onClose = vi.fn()) {
    vi.mocked(useListTransactionsQuery).mockReturnValue({
      data: [TXN],
      isLoading: false,
    } as unknown as ReturnType<typeof useListTransactionsQuery>);
    render(
      <Provider store={store}>
        <DrillDownPanel
          filter={{ category: "contract_work", startDate: "2024-06-01", endDate: "2024-06-30", label: "Contract Work — June 2024" }}
          onClose={onClose}
        />
      </Provider>,
    );
    return onClose;
  }

  async function openAndEdit() {
    await userEvent.click(screen.getByText("Test Plumber"));
    return editVendor();
  }

  it("asks before going back to the list, and Discard goes back", async () => {
    renderDrillDown();
    await openAndEdit();

    await userEvent.click(screen.getByTitle("Back to list"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: MSG.discard }));

    expect(screen.queryByRole("textbox", { name: "Vendor" })).toBeNull();
    expect(screen.getByText("Test Plumber")).toBeInTheDocument();
  });

  it("asks before closing on Escape or the close button, and keeps the edits", async () => {
    const onClose = renderDrillDown();
    const input = await openAndEdit();

    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: MSG.keepEditing }));

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(input).toHaveValue("New Plumber");
  });

  it("Save & close from the drill-down saves, then closes the drill-down", async () => {
    const onClose = renderDrillDown();
    await openAndEdit();

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await userEvent.click(screen.getByRole("button", { name: MSG.saveAndClose }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenCalledWith({ id: TXN.id, data: { vendor: "New Plumber" } });
  });

  it("closes straight away when the transaction wasn't edited", async () => {
    const onClose = renderDrillDown();
    await userEvent.click(screen.getByText("Test Plumber"));

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
