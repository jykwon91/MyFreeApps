import { baseApi } from "@platform/core/store/baseApi";
import { TRANSACTION_PAGE_SIZE } from "../constants/transactionPaging";
import type { BankCsvImportRequest } from "../types/transaction/BankCsvImportRequest";
import type { DuplicatePairsResponse } from "../types/transaction/DuplicatePairsResponse";
import type { ImportResult } from "../types/transaction/ImportResult";
import type { MergeDuplicatesRequest } from "../types/transaction/MergeDuplicatesRequest";
import type { MergeDuplicatesResponse } from "../types/transaction/MergeDuplicatesResponse";
import type { ScheduleEReport } from "../types/transaction/ScheduleEReport";
import type { Transaction } from "../types/transaction/transaction";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import type { TransactionReviewCount } from "../types/transaction/TransactionReviewCount";
import type { TransactionUpdateResult } from "../types/transaction/TransactionUpdateResult";

export const transactionsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Summary", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listTransactions: builder.query<Transaction[], TransactionListParams>({
      query: (params = {}) => ({ url: "/transactions", params: { ...params } }),
      providesTags: (result) =>
        result
          ? [...result.map((t) => ({ type: "Transaction" as const, id: t.id })), { type: "Transaction", id: "LIST" }]
          : [{ type: "Transaction", id: "LIST" }],
    }),
    // The server sends no total, so a short page is how the list knows it reached the end.
    listTransactionPages: builder.infiniteQuery<Transaction[], TransactionListParams, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.length < TRANSACTION_PAGE_SIZE ? undefined : lastOffset + TRANSACTION_PAGE_SIZE,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/transactions",
        params: { ...queryArg, limit: TRANSACTION_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flat().map((t) => ({ type: "Transaction" as const, id: t.id })) ?? []),
        { type: "Transaction", id: "LIST" },
      ],
    }),
    getTransactionReviewCount: builder.query<TransactionReviewCount, void>({
      query: () => ({ url: "/transactions/review-count" }),
      providesTags: [{ type: "Transaction", id: "REVIEW_COUNT" }],
    }),
    getTransaction: builder.query<Transaction, string>({
      query: (id) => ({ url: `/transactions/${id}` }),
      providesTags: (_result, _err, id) => [{ type: "Transaction", id }],
    }),
    createTransaction: builder.mutation<Transaction, Partial<Transaction>>({
      query: (data) => ({ url: "/transactions", method: "POST", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    updateTransaction: builder.mutation<TransactionUpdateResult, { id: string; data: Partial<Transaction> }>({
      query: ({ id, data }) => ({ url: `/transactions/${id}`, method: "PATCH", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    deleteTransaction: builder.mutation<void, string>({
      query: (id) => ({ url: `/transactions/${id}`, method: "DELETE" }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    importBankCsv: builder.mutation<ImportResult, BankCsvImportRequest>({
      query: ({ form, propertyId }) => ({
        url: "/imports/bank-csv",
        method: "POST",
        data: form,
        params: propertyId ? { property_id: propertyId } : undefined,
      }),
      // New rows change the list, the review count and every total built from them.
      invalidatesTags: ["Transaction", "Summary"],
    }),
    bulkApproveTransactions: builder.mutation<{ approved: number; skipped: number }, string[]>({
      query: (ids) => ({ url: "/transactions/bulk-approve", method: "POST", data: { ids } }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    bulkDeleteTransactions: builder.mutation<{ deleted: number }, string[]>({
      query: (ids) => ({ url: "/transactions/bulk-delete", method: "POST", data: { ids } }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    getScheduleEReport: builder.query<ScheduleEReport, number>({
      query: (taxYear) => ({ url: "/transactions/schedule-e", params: { tax_year: taxYear } }),
      providesTags: ["Transaction"],
    }),
    getDuplicates: builder.query<DuplicatePairsResponse, void>({
      query: () => ({ url: "/transactions/duplicates" }),
      providesTags: [{ type: "Transaction", id: "DUPLICATES" }],
    }),
    keepDuplicate: builder.mutation<{ kept: number; deleted: number }, { keep_id: string; delete_ids: string[] }>({
      query: (data) => ({ url: "/transactions/duplicates/keep", method: "POST", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    dismissDuplicate: builder.mutation<{ reviewed: number }, { transaction_ids: string[] }>({
      query: (data) => ({ url: "/transactions/duplicates/dismiss", method: "POST", data }),
      invalidatesTags: [{ type: "Transaction", id: "DUPLICATES" }],
    }),
    mergeDuplicates: builder.mutation<MergeDuplicatesResponse, MergeDuplicatesRequest>({
      query: (data) => ({ url: "/transactions/duplicates/merge", method: "POST", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
  }),
});

export const {
  useListTransactionsQuery,
  useListTransactionPagesInfiniteQuery,
  useGetTransactionReviewCountQuery,
  useGetTransactionQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
  useBulkApproveTransactionsMutation,
  useBulkDeleteTransactionsMutation,
  useGetScheduleEReportQuery,
  useGetDuplicatesQuery,
  useKeepDuplicateMutation,
  useDismissDuplicateMutation,
  useMergeDuplicatesMutation,
  useImportBankCsvMutation,
} = transactionsApi;
