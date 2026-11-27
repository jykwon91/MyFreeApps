import { baseApi } from "@platform/core/store/baseApi";
import type { LoanPayee } from "../types/loan-payee/loan-payee";
import type { LoanPayeeTagRequest } from "../types/loan-payee/loan-payee-tag-request";

const loanPayeeTag = (transactionId: string) => ({ type: "LoanPayee" as const, id: transactionId });

// A tag applies to every payment to the payee, so every transaction's tag
// state and every total built from them reload.
const TAGGED_TAGS = [
  { type: "LoanPayee" as const, id: "LIST" },
  { type: "Transaction" as const, id: "LIST" },
  "CashFlow" as const,
];

/**
 * Counting a payee's payments as a mortgage or a loan, from one of its
 * transactions. Cash flow and Monthly expenses read the tag when they add up.
 */
export const loanPayeeApi = baseApi.enhanceEndpoints({
  addTagTypes: ["LoanPayee", "Transaction", "CashFlow"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getLoanPayee: builder.query<LoanPayee, string>({
      query: (transactionId) => ({ url: `/transactions/${transactionId}/loan-payee` }),
      providesTags: (_result, _error, transactionId) => [loanPayeeTag(transactionId), { type: "LoanPayee", id: "LIST" }],
    }),
    tagLoanPayee: builder.mutation<LoanPayee, LoanPayeeTagRequest>({
      query: ({ transactionId, kind }) => ({
        url: `/transactions/${transactionId}/loan-payee`,
        method: "PUT",
        data: { kind },
      }),
      invalidatesTags: TAGGED_TAGS,
    }),
    untagLoanPayee: builder.mutation<LoanPayee, string>({
      query: (transactionId) => ({ url: `/transactions/${transactionId}/loan-payee`, method: "DELETE" }),
      invalidatesTags: TAGGED_TAGS,
    }),
  }),
});

export const { useGetLoanPayeeQuery, useTagLoanPayeeMutation, useUntagLoanPayeeMutation } = loanPayeeApi;
