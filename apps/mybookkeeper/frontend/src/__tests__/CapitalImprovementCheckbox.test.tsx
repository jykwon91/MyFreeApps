import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", async () => {
  const { EMPTY_FINANCIAL_ACCOUNTS_QUERY } = await import("@/test/empty-financial-accounts");
  return { useListFinancialAccountsQuery: () => EMPTY_FINANCIAL_ACCOUNTS_QUERY };
});

vi.mock("@mybookkeeper/api-client/store/spendingCategoriesApi", () => ({
  useListSpendingCategoriesQuery: () => ({ data: [], isLoading: false }),
}));

const updateUnwrap = vi.fn();
const updateTransaction = vi.fn(() => ({ unwrap: updateUnwrap }));

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useUpdateTransactionMutation: () => [updateTransaction, { isLoading: false }],
  useDeleteTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useSetPropertySplitMutation: () => [vi.fn(), { isLoading: false }],
  useRemovePropertySplitMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@mybookkeeper/api-client/store/vendorsApi", async () => {
  const { EMPTY_VENDOR_PAGES } = await import("@/test/empty-vendor-pages");
  return {
    useListVendorPagesInfiniteQuery: () => EMPTY_VENDOR_PAGES,
    useGetVendorByIdQuery: () => ({ currentData: undefined }),
  };
});

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

const BASE_TXN = {
  id: "00000000-0000-0000-0000-000000000001",
  vendor: "Home Depot",
  vendor_id: null,
  description: null,
  amount: "500.00",
  transaction_type: "expense",
  category: "maintenance",
  property_id: null,
  property_splits: [],
  tax_relevant: false,
  is_capital_improvement: false,
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

const INCOME_TXN = {
  ...BASE_TXN,
  id: "00000000-0000-0000-0000-000000000002",
  transaction_type: "income",
  category: "rental_revenue",
} as unknown as Transaction;

const PERSONAL_TXN = {
  ...BASE_TXN,
  id: "00000000-0000-0000-0000-000000000003",
  transaction_scope: "personal",
  spending_category_id: null,
} as unknown as Transaction;

function renderPanel(txn: Transaction) {
  render(
    <Provider store={store}>
      <TransactionPanel transaction={txn} properties={[]} onClose={vi.fn()} />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUnwrap.mockResolvedValue({ retroactive_count: 0 });
});

describe("Capital improvement checkbox", () => {
  it("shows for expense transactions", async () => {
    renderPanel(BASE_TXN);
    expect(await screen.findByRole("checkbox", { name: "Capital improvement" })).toBeInTheDocument();
  });

  it("is hidden for income transactions", async () => {
    renderPanel(INCOME_TXN);
    // Wait for the tax-relevant checkbox (always present) to confirm the form has rendered.
    await screen.findByRole("checkbox", { name: "Include in tax reports" });
    expect(screen.queryByRole("checkbox", { name: "Capital improvement" })).not.toBeInTheDocument();
  });

  it("is hidden, with the tax toggle, for personal spending", async () => {
    renderPanel(PERSONAL_TXN);
    await screen.findByRole("textbox", { name: "Vendor" });
    expect(screen.queryByRole("checkbox", { name: "Capital improvement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Include in tax reports" })).not.toBeInTheDocument();
  });

  it("includes is_capital_improvement: true in the update payload when checked", async () => {
    renderPanel(BASE_TXN);
    const checkbox = await screen.findByRole("checkbox", { name: "Capital improvement" });
    await userEvent.click(checkbox);

    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));

    await waitFor(() =>
      expect(updateTransaction).toHaveBeenCalledWith({
        id: BASE_TXN.id,
        data: expect.objectContaining({ is_capital_improvement: true }),
      }),
    );
  });

  it("does not include is_capital_improvement in the payload when untouched", async () => {
    renderPanel(BASE_TXN);
    // Change vendor to make the form dirty (so Save button appears), but leave checkbox alone.
    const vendor = await screen.findByRole("textbox", { name: "Vendor" });
    await userEvent.clear(vendor);
    await userEvent.type(vendor, "Lowes");

    await userEvent.click(screen.getByRole("button", { name: "Save & Approve" }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalled());
    const payload = (updateTransaction.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(payload.data).not.toHaveProperty("is_capital_improvement");
  });
});
