import { baseApi } from "@platform/ui";
import type {
  DropFinancials,
  ExpenseCreate,
  ExpenseRead,
  ExpenseUpdate,
} from "@/types/financials/financials";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["Financials"],
});

const financialsApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    getFinancials: build.query<DropFinancials, string>({
      query: (dropId) => ({
        url: `/financials/drops/${dropId}`,
        method: "GET",
      }),
      providesTags: (_result, _err, dropId) => [
        { type: "Financials", id: dropId },
      ],
    }),
    updateTip: build.mutation<
      { id: string; tip_total: string },
      { dropId: string; tipTotal: string }
    >({
      query: ({ dropId, tipTotal }) => ({
        url: `/financials/drops/${dropId}/tip`,
        method: "PATCH",
        data: { tip_total: tipTotal },
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Financials", id: dropId },
      ],
    }),
    createExpense: build.mutation<
      ExpenseRead,
      { dropId: string; body: ExpenseCreate }
    >({
      query: ({ dropId, body }) => ({
        url: `/financials/drops/${dropId}/expenses`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Financials", id: dropId },
      ],
    }),
    updateExpense: build.mutation<
      ExpenseRead,
      { dropId: string; expenseId: string; body: ExpenseUpdate }
    >({
      query: ({ expenseId, body }) => ({
        url: `/financials/expenses/${expenseId}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Financials", id: dropId },
      ],
    }),
    deleteExpense: build.mutation<
      void,
      { dropId: string; expenseId: string }
    >({
      query: ({ expenseId }) => ({
        url: `/financials/expenses/${expenseId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Financials", id: dropId },
      ],
    }),
  }),
});

export const {
  useGetFinancialsQuery,
  useUpdateTipMutation,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
} = financialsApi;
