import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { UseFormRegister } from "react-hook-form";
import { store } from "@/shared/store";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import { TRANSACTION_EDIT_MESSAGES as MSG } from "@/shared/lib/transaction-edit-messages";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";

vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", async () => {
  const { EMPTY_FINANCIAL_ACCOUNTS_QUERY } = await import("@/test/empty-financial-accounts");
  return { useListFinancialAccountsQuery: () => EMPTY_FINANCIAL_ACCOUNTS_QUERY };
});

const updateUnwrap = vi.fn();
const updateTransaction = vi.fn((_args: { id: string; data: Partial<Transaction> }) => ({ unwrap: updateUnwrap }));

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useUpdateTransactionMutation: () => [updateTransaction, { isLoading: false }],
  useDeleteTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useSetPropertySplitMutation: () => [vi.fn(), { isLoading: false }],
  useRemovePropertySplitMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

// The real form pulls vendors, previews and duplicates; these tests are about the
// date and tax year, so those two fields are enough.
vi.mock("@/app/features/transactions/TransactionForm", () => ({
  default: ({ register, onSubmit }: { register: UseFormRegister<TransactionFormValues>; onSubmit: () => void }) => (
    <form id="transaction-panel-form" onSubmit={onSubmit}>
      <input aria-label="Date" type="date" {...register("transaction_date")} />
      <input aria-label="Tax Year" type="number" {...register("tax_year", { valueAsNumber: true })} />
    </form>
  ),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

const DECEMBER_RENT = {
  id: "00000000-0000-0000-0000-000000000001",
  vendor: "Tenant",
  vendor_id: null,
  description: null,
  amount: "1500.00",
  transaction_type: "income",
  category: "rental_revenue",
  property_id: null,
  property_splits: [],
  tax_relevant: true,
  is_capital_improvement: false,
  payment_method: null,
  channel: null,
  transaction_date: "2025-12-30",
  tax_year: 2025,
  status: "approved",
  is_manual: false,
  created_at: "2025-12-30T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
} as unknown as Transaction;

function renderPanel(transaction: Transaction = DECEMBER_RENT) {
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <TransactionPanel transaction={transaction} properties={[]} onClose={onClose} />
    </Provider>,
  );
  return onClose;
}

function changeDate(value: string) {
  fireEvent.change(screen.getByLabelText("Date"), { target: { value } });
}

async function clickSave() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

function lastPatch(): Partial<Transaction> | undefined {
  const calls = updateTransaction.mock.calls;
  return calls[calls.length - 1]?.[0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUnwrap.mockResolvedValue({ retroactive_count: 0 });
});

describe("TransactionPanel tax year question", () => {
  it("asks which tax year it belongs to when the date moves to another year, and moves it on request", async () => {
    const onClose = renderPanel();
    changeDate("2026-01-02");
    await clickSave();

    const dialog = await screen.findByRole("alertdialog", { name: "Move it to tax year 2026?" });
    expect(dialog).toHaveTextContent("The new date is in 2026, but this is filed under tax year 2025.");
    expect(updateTransaction).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Move to 2026" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastPatch()).toEqual({ transaction_date: "2026-01-02", tax_year: 2026 });
  });

  it("can keep the old tax year", async () => {
    const onClose = renderPanel();
    changeDate("2026-01-02");
    await clickSave();

    await userEvent.click(await screen.findByRole("button", { name: "Keep 2025" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastPatch()).toEqual({ transaction_date: "2026-01-02" });
  });

  it("saves nothing when the question is backed out of", async () => {
    const onClose = renderPanel();
    changeDate("2026-01-02");
    await clickSave();

    await userEvent.click(await screen.findByRole("button", { name: "Keep editing" }));
    expect(screen.queryByTestId("tax-year-change-dialog")).toBeNull();
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-01-02");
  });

  it("doesn't ask when the new date stays in the same year", async () => {
    const onClose = renderPanel();
    changeDate("2025-12-15");
    await clickSave();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("tax-year-change-dialog")).toBeNull();
    expect(lastPatch()).toEqual({ transaction_date: "2025-12-15" });
  });

  it("sends a typed-in tax year without asking about the date", async () => {
    const onClose = renderPanel();
    changeDate("2026-01-02");
    fireEvent.change(screen.getByLabelText("Tax Year"), { target: { value: "2026" } });
    await clickSave();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("tax-year-change-dialog")).toBeNull();
    expect(lastPatch()).toEqual({ transaction_date: "2026-01-02", tax_year: 2026 });
  });

  it("asks again for a row whose tax year already differs from its date", async () => {
    const onClose = renderPanel({ ...DECEMBER_RENT, transaction_date: "2026-01-02", tax_year: 2025 });
    changeDate("2026-01-05");
    await clickSave();

    await userEvent.click(await screen.findByRole("button", { name: "Move to 2026" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastPatch()).toEqual({ transaction_date: "2026-01-05", tax_year: 2026 });
  });

  it("asks from the unsaved-changes prompt's Save & close too, and backing out returns to the form", async () => {
    const onClose = renderPanel();
    changeDate("2026-01-02");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: MSG.saveAndClose }));

    await userEvent.click(await screen.findByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByTestId("unsaved-changes-dialog")).toBeNull());
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
