import { baseApi } from "@platform/core/store/baseApi";
import type { BudgetMonth } from "../types/budget/budget-month";
import type { SpendingBudget } from "../types/budget/spending-budget";
import type { SpendingBudgetUpdateRequest } from "../types/budget/spending-budget-update-request";
import type { CashFlow } from "../types/cash-flow/cash-flow";
import type { CashFlowQuery } from "../types/cash-flow/cash-flow-query";
import type { MonthlyExpenseCategoryDetail } from "../types/monthly-expenses/monthly-expense-category-detail";
import type { MonthlyExpenseCategoryQuery } from "../types/monthly-expenses/monthly-expense-category-query";
import type { MonthlyExpenses } from "../types/monthly-expenses/monthly-expenses";
import type { MonthlyExpensesQuery } from "../types/monthly-expenses/monthly-expenses-query";

/**
 * The budget, cash flow and monthly expenses pages. All add up transactions, so they also
 * listen to the transaction list: an edit, import or bank sync elsewhere
 * refreshes them without wiring each mutation here. The budget page also
 * listens to the spending categories, so a rename or archive shows at once.
 */
export const budgetApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Budget", "CashFlow", "Transaction", "SpendingCategory"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getBudgetMonth: builder.query<BudgetMonth, string>({
      query: (month) => ({ url: "/budgets", params: { month } }),
      providesTags: [
        "Budget",
        { type: "Transaction", id: "LIST" },
        { type: "SpendingCategory", id: "LIST" },
      ],
    }),

    setCategoryBudget: builder.mutation<SpendingBudget, { categoryId: string; data: SpendingBudgetUpdateRequest }>({
      query: ({ categoryId, data }) => ({ url: `/budgets/${categoryId}`, method: "PUT", data }),
      invalidatesTags: ["Budget"],
    }),

    getCashFlow: builder.query<CashFlow, CashFlowQuery>({
      query: ({ range, scope, accountId }) => ({
        url: "/cash-flow",
        params: accountId === null ? { range, scope } : { range, scope, account_id: accountId },
      }),
      providesTags: ["CashFlow", { type: "Transaction", id: "LIST" }],
    }),

    getMonthlyExpenses: builder.query<MonthlyExpenses, MonthlyExpensesQuery>({
      query: ({ range, scope }) => ({ url: "/monthly-expenses", params: { range, scope } }),
      providesTags: [{ type: "Transaction", id: "LIST" }, { type: "SpendingCategory", id: "LIST" }],
    }),

    getMonthlyExpenseCategory: builder.query<MonthlyExpenseCategoryDetail, MonthlyExpenseCategoryQuery>({
      query: ({ range, scope, label }) => ({
        url: "/monthly-expenses/category",
        params: { range, scope, category: label },
      }),
      providesTags: [{ type: "Transaction", id: "LIST" }, { type: "SpendingCategory", id: "LIST" }],
    }),
  }),
});

export const {
  useGetBudgetMonthQuery,
  useSetCategoryBudgetMutation,
  useGetCashFlowQuery,
  useGetMonthlyExpensesQuery,
  useGetMonthlyExpenseCategoryQuery,
} = budgetApi;
