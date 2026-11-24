import { baseApi } from "@platform/core/store/baseApi";
import type { FinancialAccount } from "../types/financial-account/financial-account";
import type { FinancialAccountCreateRequest } from "../types/financial-account/financial-account-create-request";
import type { FinancialAccountListResponse } from "../types/financial-account/financial-account-list-response";
import type { FinancialAccountUpdateRequest } from "../types/financial-account/financial-account-update-request";

/**
 * Bank, card, loan and investment accounts. Web and phone share it.
 *
 * Per-id ``FinancialAccount:{id}`` plus a shared ``FinancialAccount:LIST``.
 * Delete and restore also refresh the transaction list, since its Account
 * column names the account.
 */
export const financialAccountsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["FinancialAccount", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listFinancialAccounts: builder.query<FinancialAccountListResponse, void>({
      query: () => ({ url: "/financial-accounts" }),
      providesTags: (result) => [
        ...(result?.items.map((account) => ({ type: "FinancialAccount" as const, id: account.id })) ?? []),
        { type: "FinancialAccount" as const, id: "LIST" },
      ],
    }),

    createFinancialAccount: builder.mutation<FinancialAccount, FinancialAccountCreateRequest>({
      query: (data) => ({ url: "/financial-accounts", method: "POST", data }),
      invalidatesTags: [{ type: "FinancialAccount", id: "LIST" }],
    }),

    updateFinancialAccount: builder.mutation<FinancialAccount, { accountId: string; data: FinancialAccountUpdateRequest }>({
      query: ({ accountId, data }) => ({ url: `/financial-accounts/${accountId}`, method: "PATCH", data }),
      invalidatesTags: (_r, _e, { accountId }) => [
        { type: "FinancialAccount", id: accountId },
        { type: "FinancialAccount", id: "LIST" },
      ],
    }),

    deleteFinancialAccount: builder.mutation<void, string>({
      query: (id) => ({ url: `/financial-accounts/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "FinancialAccount", id },
        { type: "FinancialAccount", id: "LIST" },
        "Transaction",
      ],
    }),

    restoreFinancialAccount: builder.mutation<FinancialAccount, string>({
      query: (id) => ({ url: `/financial-accounts/${id}/restore`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "FinancialAccount", id },
        { type: "FinancialAccount", id: "LIST" },
        "Transaction",
      ],
    }),
  }),
});

export const {
  useListFinancialAccountsQuery,
  useCreateFinancialAccountMutation,
  useUpdateFinancialAccountMutation,
  useDeleteFinancialAccountMutation,
  useRestoreFinancialAccountMutation,
} = financialAccountsApi;
