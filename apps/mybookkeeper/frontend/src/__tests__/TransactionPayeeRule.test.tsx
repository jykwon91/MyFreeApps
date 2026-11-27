import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import type { UseFormRegister } from "react-hook-form";
import { store } from "@/shared/store";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import { PAYEE_RULE_MESSAGES as MSG } from "@/shared/lib/payee-rule-messages";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";

const updateUnwrap = vi.fn();
const updateTransaction = vi.fn(() => ({ unwrap: updateUnwrap }));
const createUnwrap = vi.fn();
const createRule = vi.fn((_body: unknown) => ({ unwrap: createUnwrap }));
const countUnwrap = vi.fn();
const countPastMatches = vi.fn((_id: string) => ({ unwrap: countUnwrap }));
const applyUnwrap = vi.fn();
const applyRuleToPast = vi.fn((_id: string) => ({ unwrap: applyUnwrap }));
const onVendorLearned = vi.fn();

vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useUpdateTransactionMutation: () => [updateTransaction, { isLoading: false }],
  useDeleteTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useSetPropertySplitMutation: () => [vi.fn(), { isLoading: false }],
  useRemovePropertySplitMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@mybookkeeper/api-client/store/classificationRulesApi", () => ({
  useCreateClassificationRuleMutation: () => [createRule, { isLoading: false }],
  useLazyGetRulePastMatchesQuery: () => [countPastMatches],
  useApplyRuleToPastMutation: () => [applyRuleToPast, { isLoading: false }],
}));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", async () => {
  const { EMPTY_FINANCIAL_ACCOUNTS_QUERY } = await import("@/test/empty-financial-accounts");
  return { useListFinancialAccountsQuery: () => EMPTY_FINANCIAL_ACCOUNTS_QUERY };
});
vi.mock("@/shared/hooks/useOrgRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/hooks/useOrgRole")>()),
  useIsOrgAdmin: vi.fn(() => true),
}));
// The rule comes from the saved row, so one editable field is enough.
vi.mock("@/app/features/transactions/TransactionForm", () => ({
  default: ({ register, onSubmit }: { register: UseFormRegister<TransactionFormValues>; onSubmit: () => void }) => (
    <form id="transaction-panel-form" onSubmit={onSubmit}>
      <input aria-label="Category" {...register("category")} />
    </form>
  ),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: (msg: string) => showSuccess(msg),
  showError: (msg: string) => showError(msg),
}));

const PAYEE = "Zelle payment to Jason Law";
const HOUSES = ["p-6732", "p-6734", "p-6738"];

const TXN = {
  id: "00000000-0000-0000-0000-000000000001",
  vendor: PAYEE,
  vendor_id: null,
  description: null,
  amount: "300.00",
  transaction_type: "expense",
  category: "maintenance",
  transaction_scope: "rental",
  property_id: null,
  property_splits: HOUSES.map((property_id) => ({ property_id, amount: "100.00" })),
  tax_relevant: true,
  payment_method: null,
  channel: null,
  transaction_date: "2026-06-15",
  tax_year: 2026,
  status: "approved",
  is_manual: false,
  created_at: "2026-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
} as unknown as Transaction;

function renderPanel(transaction: Transaction = TXN) {
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <TransactionPanel transaction={transaction} properties={[]} onClose={onClose} onVendorLearned={onVendorLearned} />
    </Provider>,
  );
  return onClose;
}

const option = () => screen.queryByRole("checkbox", { name: new RegExp(MSG.alwaysFileLabel) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsOrgAdmin).mockReturnValue(true);
  createUnwrap.mockResolvedValue({ id: "rule-1", match_pattern: "zelle payment to jason law" });
  countUnwrap.mockResolvedValue({ count: 0 });
  applyUnwrap.mockResolvedValue({ applied: 0 });
});

describe("Always file payments to this payee like this", () => {
  it("is offered to admins, for a payment with a payee", () => {
    renderPanel();
    expect(option()).toBeInTheDocument();
  });

  it("is not offered to members who can't save rules", () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    renderPanel();
    expect(option()).not.toBeInTheDocument();
  });

  it("is not offered for a transfer", () => {
    renderPanel({ ...TXN, transaction_type: "transfer" } as Transaction);
    expect(option()).not.toBeInTheDocument();
  });

  it("saves a rule that splits evenly across the row's properties, then closes when nothing in the past matches", async () => {
    const onClose = renderPanel();
    await userEvent.click(option()!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(createRule).toHaveBeenCalledWith({
      match_type: "vendor",
      match_pattern: PAYEE,
      category: "maintenance",
      transaction_scope: "rental",
      split_property_ids: HOUSES,
    });
    expect(countPastMatches).toHaveBeenCalledWith("rule-1");
    expect(showSuccess).toHaveBeenCalledWith(MSG.saved(PAYEE));
    expect(screen.queryByText(MSG.pastTitle)).not.toBeInTheDocument();
  });

  it("asks before filing past payments, files them, then closes", async () => {
    countUnwrap.mockResolvedValue({ count: 14 });
    applyUnwrap.mockResolvedValue({ applied: 14 });
    const onClose = renderPanel();
    await userEvent.click(option()!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(MSG.pastTitle)).toBeInTheDocument();
    expect(screen.getByText(MSG.pastDescription(14, "zelle payment to jason law"))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: MSG.pastConfirm(14) }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(applyRuleToPast).toHaveBeenCalledWith("rule-1");
    expect(showSuccess).toHaveBeenCalledWith(MSG.applied(14, "zelle payment to jason law"));
  });

  it("closes without filing past payments when the person says not now", async () => {
    countUnwrap.mockResolvedValue({ count: 3 });
    const onClose = renderPanel();
    await userEvent.click(option()!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: MSG.pastSkip }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(applyRuleToPast).not.toHaveBeenCalled();
  });

  it("uses the category as saved, and says so once, after a recategorise", async () => {
    updateUnwrap.mockResolvedValue({ ...TXN, category: "cleaning_expense", property_splits: [], property_id: "p-6734", retroactive_count: 2 });
    const onClose = renderPanel();
    await userEvent.clear(screen.getByRole("textbox", { name: "Category" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Category" }), "cleaning_expense");
    await userEvent.click(option()!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createRule).toHaveBeenCalledWith(expect.objectContaining({ category: "cleaning_expense", property_id: "p-6734" }));
    expect(onVendorLearned).not.toHaveBeenCalled();
  });

  it("tells the person when the rule couldn't be saved, keeping the row's own save", async () => {
    createUnwrap.mockRejectedValue({ status: 500 });
    const onClose = renderPanel();
    await userEvent.click(option()!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(MSG.couldntSave));
    expect(countPastMatches).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
