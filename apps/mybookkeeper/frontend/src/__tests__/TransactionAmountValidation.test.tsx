import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import ManualEntryForm from "@/app/features/transactions/ManualEntryForm";
import { TRANSACTION_EDIT_MESSAGES as MSG } from "@/shared/lib/transaction-edit-messages";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

const updateUnwrap = vi.fn();
const updateTransaction = vi.fn(() => ({ unwrap: updateUnwrap }));
const createUnwrap = vi.fn();
const createTransaction = vi.fn(() => ({ unwrap: createUnwrap }));

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useUpdateTransactionMutation: () => [updateTransaction, { isLoading: false }],
  useDeleteTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useCreateTransactionMutation: () => [createTransaction, { isLoading: false }],
}));

vi.mock("@mybookkeeper/api-client/store/vendorsApi", () => ({
  useGetVendorsQuery: () => ({ data: { items: [] }, isLoading: false }),
}));

const showError = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: (msg: string) => showError(msg),
}));

const PENDING = {
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
  status: "pending",
  is_manual: false,
  created_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
  tags: [],
} as unknown as Transaction;

const ABOVE_ZERO = "Enter an amount above $0.";
const DOLLARS_AND_CENTS = "Use dollars and cents, like 84.20.";

function renderPanel(onClose = vi.fn()) {
  render(
    <Provider store={store}>
      <TransactionPanel transaction={PENDING} properties={[]} onClose={onClose} />
    </Provider>,
  );
  return onClose;
}

async function typeAmount(value: string) {
  const input = screen.getByRole("spinbutton", { name: "Amount" });
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUnwrap.mockResolvedValue({ retroactive_count: 0 });
  createUnwrap.mockResolvedValue({});
});

describe("TransactionPanel amount", () => {
  it.each([
    ["", ABOVE_ZERO],
    ["0", ABOVE_ZERO],
    ["-5", DOLLARS_AND_CENTS],
    ["12.345", DOLLARS_AND_CENTS],
  ])("Save & Approve refuses %j with a field error and sends nothing", async (value, message) => {
    const onClose = renderPanel();
    const input = await typeAmount(value);

    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(message);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Save refuses a cleared amount instead of keeping the old one", async () => {
    const onClose = renderPanel();
    await typeAmount("");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ABOVE_ZERO);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Save & close in the prompt repeats the amount problem there and keeps the prompt open", async () => {
    const onClose = renderPanel();
    await typeAmount("12.345");
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));

    const dialog = screen.getByRole("alertdialog", { name: MSG.unsavedTitle });
    await userEvent.click(within(dialog).getByRole("button", { name: MSG.saveAndClose }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(DOLLARS_AND_CENTS);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the error clears once the amount is fixed, and the fixed amount is sent", async () => {
    const onClose = renderPanel();
    await typeAmount("12.345");
    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));
    await screen.findByRole("alert");

    await typeAmount("84.25");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenCalledWith({ id: PENDING.id, data: { amount: "84.25", status: "approved" } });
  });

  it("an unchanged amount still approves", async () => {
    const onClose = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateTransaction).toHaveBeenCalledWith({ id: PENDING.id, data: { status: "approved" } });
  });

  it("a server refusal shows the server's reason, a crash the usual message", async () => {
    renderPanel();
    await typeAmount("84.25");
    updateUnwrap.mockRejectedValueOnce({ status: 422, data: { detail: [{ msg: "Value error, That amount is too large." }] } });
    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("That amount is too large."));

    updateUnwrap.mockRejectedValueOnce({ status: 500, data: { detail: "boom" } });
    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() => expect(showError).toHaveBeenLastCalledWith(MSG.couldntSave));
  });
});

describe("ManualEntryForm amount", () => {
  function renderForm() {
    const onSuccess = vi.fn();
    render(
      <Provider store={store}>
        <ManualEntryForm properties={[]} onClose={vi.fn()} onSuccess={onSuccess} />
      </Provider>,
    );
    return onSuccess;
  }

  it.each([
    ["0", ABOVE_ZERO],
    ["-5", DOLLARS_AND_CENTS],
    ["12.345", DOLLARS_AND_CENTS],
  ])("names the problem with %j on leaving the field and keeps Create disabled", async (value, message) => {
    renderForm();
    await typeAmount(value);
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Create Transaction" })).toBeDisabled();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("creates with a dollars-and-cents amount", async () => {
    const onSuccess = renderForm();
    await typeAmount("84.25");

    await userEvent.click(screen.getByRole("button", { name: "Create Transaction" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: "84.25" }));
  });
});
