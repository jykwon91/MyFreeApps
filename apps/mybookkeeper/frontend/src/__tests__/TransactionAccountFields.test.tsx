import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, renderHook, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import TransactionAccountFields from "@/app/features/transactions/TransactionAccountFields";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import { TRANSACTION_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/transaction-account-messages";
import { aFinancialAccount } from "@/test/financial-account-fixture";

const CHECKING = aFinancialAccount();
const SAVINGS = aFinancialAccount({ id: "acct-2", name: "Ally Savings", account_type: "savings", mask: null });
const CLOSED = aFinancialAccount({ id: "acct-3", name: "Old Card", account_type: "credit_card", mask: null, closed_on: "2026-01-01" });

interface AccountsQuery {
  data?: { items: FinancialAccount[]; totals: [] };
  isLoading: boolean;
  isError: boolean;
}

let query: AccountsQuery = { isLoading: true, isError: false };
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", () => ({
  useListFinancialAccountsQuery: () => query,
}));

function loaded(items: FinancialAccount[]): AccountsQuery {
  return { data: { items, totals: [] }, isLoading: false, isError: false };
}

function renderFields(values: Partial<TransactionFormValues>) {
  const { result } = renderHook(() =>
    useForm<TransactionFormValues>({
      defaultValues: { transaction_type: "expense", account_id: "", transfer_to_account_id: "", ...values },
    }),
  );
  render(<TransactionAccountFields register={result.current.register} watch={result.current.watch} />);
}

function optionLabels(testId: string): string[] {
  return within(screen.getByTestId(testId)).getAllByRole("option").map((option) => option.textContent ?? "");
}

afterEach(cleanup);

describe("TransactionAccountFields", () => {
  it("offers the open accounts in one Account select for income or expense", () => {
    query = loaded([CHECKING, SAVINGS, CLOSED]);
    renderFields({});
    expect(screen.getByLabelText(MSG.label)).toBeInTheDocument();
    expect(optionLabels("transaction-account-select")).toEqual([MSG.none, "Chase Checking ··4821", "Ally Savings"]);
    expect(screen.queryByTestId("transaction-transfer-to-select")).not.toBeInTheDocument();
  });

  it("keeps a closed account the transaction already names", () => {
    query = loaded([CHECKING, CLOSED]);
    renderFields({ account_id: CLOSED.id });
    expect(optionLabels("transaction-account-select")).toContain("Old Card");
    expect(screen.getByTestId("transaction-account-select")).toHaveValue(CLOSED.id);
  });

  it("asks for both sides of a transfer", () => {
    query = loaded([CHECKING, SAVINGS]);
    renderFields({ transaction_type: "transfer", account_id: CHECKING.id, transfer_to_account_id: SAVINGS.id });
    expect(screen.getByLabelText(MSG.fromLabel)).toHaveValue(CHECKING.id);
    expect(screen.getByLabelText(MSG.toLabel)).toHaveValue(SAVINGS.id);
  });

  it("holds a placeholder while the accounts load", () => {
    query = { isLoading: true, isError: false };
    renderFields({});
    expect(screen.getByTestId("transaction-account-select-skeleton")).toBeInTheDocument();
  });

  it("says when the accounts couldn't load", () => {
    query = { isLoading: false, isError: true };
    renderFields({});
    expect(screen.getByText(MSG.loadFailed)).toBeInTheDocument();
  });
});
