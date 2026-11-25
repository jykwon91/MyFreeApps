import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonthlyExpenseCategoryRow from "@/app/features/monthly-expenses/MonthlyExpenseCategoryRow";
import type { MonthlyExpenseCategoryDetail } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-category-detail";
import type { MonthlyExpenseTransaction } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-transaction";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import { MONTHLY_EXPENSE_PAYMENTS_PAGE_SIZE } from "@/shared/lib/monthly-expenses-pages";

const useDetail = vi.fn();
vi.mock("@mybookkeeper/api-client/store/budgetApi", () => ({
  useGetMonthlyExpenseCategoryQuery: (arg: unknown) => useDetail(arg),
}));

function payment(i: number): MonthlyExpenseTransaction {
  return {
    id: `t${i}`, date: `2026-10-${String(28 - i).padStart(2, "0")}`, payee: i % 2 ? "Silvia" : "HEB",
    description: i % 2 ? "Zelle payment to Silvia" : null,
    account_name: "Checking", account_institution: "TDECU", account_mask: "4821", amount_cents: 10_00,
  };
}

const COUNT = MONTHLY_EXPENSE_PAYMENTS_PAGE_SIZE + 2;
const DETAIL: MonthlyExpenseCategoryDetail = {
  range: "6m", scope: "all", label: "Groceries", currency: "USD", total_cents: COUNT * 10_00,
  payees: [
    { payee: "HEB", total_cents: 60_00, transaction_count: 6 },
    { payee: "Silvia", total_cents: 60_00, transaction_count: 6 },
  ],
  transactions: Array.from({ length: COUNT }, (_, i) => payment(i)),
};

function renderRow() {
  render(
    <ul>
      <MonthlyExpenseCategoryRow
        category={{ label: "Groceries", total_cents: COUNT * 10_00, average_cents: 20_00, share_percent: 12.5 }}
        currency="USD"
        query={{ range: "6m", scope: "all" }}
      />
    </ul>,
  );
}

beforeEach(() => useDetail.mockReset());
afterEach(cleanup);

describe("MonthlyExpenseCategoryRow", () => {
  it("asks for nothing until it is opened, then for its own heading over the page's months", async () => {
    useDetail.mockReturnValue({ currentData: DETAIL, isFetching: false, isError: false, refetch: vi.fn() });
    renderRow();
    expect(screen.getByTestId("monthly-expense-category-share")).toHaveTextContent(MSG.shareOf(12.5));
    expect(useDetail).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("monthly-expense-category-toggle"));
    expect(useDetail).toHaveBeenCalledWith({ range: "6m", scope: "all", label: "Groceries" });
  });

  it("lists who got how much, then a page of payments with more on request", async () => {
    useDetail.mockReturnValue({ currentData: DETAIL, isFetching: false, isError: false, refetch: vi.fn() });
    renderRow();
    await userEvent.click(screen.getByTestId("monthly-expense-category-toggle"));
    expect(screen.getAllByTestId("monthly-expense-payee-name").map((el) => el.textContent)).toEqual(["HEB", "Silvia"]);
    expect(screen.getAllByTestId("monthly-expense-transaction")).toHaveLength(MONTHLY_EXPENSE_PAYMENTS_PAGE_SIZE);
    expect(screen.getAllByTestId("monthly-expense-transaction-account")[0]).toHaveTextContent("Checking ··4821 · TDECU");
    await userEvent.click(screen.getByTestId("monthly-expense-transactions-more"));
    expect(screen.getAllByTestId("monthly-expense-transaction")).toHaveLength(COUNT);
    expect(screen.queryByTestId("monthly-expense-transactions-more")).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and a retry when it fails", async () => {
    const refetch = vi.fn();
    useDetail.mockReturnValue({ currentData: undefined, isFetching: true, isError: false, refetch });
    renderRow();
    await userEvent.click(screen.getByTestId("monthly-expense-category-toggle"));
    expect(screen.getAllByTestId("monthly-expense-detail-skeleton-payment")).toHaveLength(3);
    useDetail.mockReturnValue({ currentData: undefined, isFetching: false, isError: true, refetch });
    await userEvent.click(screen.getByTestId("monthly-expense-category-toggle"));
    await userEvent.click(screen.getByTestId("monthly-expense-category-toggle"));
    expect(screen.getByText(MSG.detailLoadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
