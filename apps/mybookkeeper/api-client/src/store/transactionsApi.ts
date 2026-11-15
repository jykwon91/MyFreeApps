import { baseApi } from "@platform/core/store/baseApi";
import { RECEIPTS_PENDING_TAG } from "../constants/receiptsPendingTag";
import { TRANSACTION_PAGE_SIZE } from "../constants/transactionPaging";
import type { BankCsvImportRequest } from "../types/transaction/BankCsvImportRequest";
import type { BulkApproveTransactionsResponse } from "../types/transaction/BulkApproveTransactionsResponse";
import type { BulkDeleteTransactionsResponse } from "../types/transaction/BulkDeleteTransactionsResponse";
import type { DuplicatePairsResponse } from "../types/transaction/DuplicatePairsResponse";
import type { ImportResult } from "../types/transaction/ImportResult";
import type { MergeDuplicatesRequest } from "../types/transaction/MergeDuplicatesRequest";
import type { MergeDuplicatesResponse } from "../types/transaction/MergeDuplicatesResponse";
import type { ScheduleEReport } from "../types/transaction/ScheduleEReport";
import type { Transaction } from "../types/transaction/transaction";
import type { TransactionListPage } from "../types/transaction/TransactionListPage";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import type { TransactionPageParams } from "../types/transaction/TransactionPageParams";
import type { TransactionSelectionRef } from "../types/transaction/TransactionSelectionRef";
import type { TransactionReviewCount } from "../types/transaction/TransactionReviewCount";
import type { TransactionUpdateResult } from "../types/transaction/TransactionUpdateResult";
import { pathWithQuery } from "../utils/pathWithQuery";
import { transactionListQuery } from "../utils/transactionListQuery";

export const transactionsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Summary", "Transaction", "SignedLease", "TaxReturn"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listTransactions: builder.query<Transaction[], TransactionListParams>({
      query: (params = {}) => ({ url: pathWithQuery("/transactions", transactionListQuery(params)) }),
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
        url: pathWithQuery(
          "/transactions",
          `${transactionListQuery({ ...queryArg, limit: TRANSACTION_PAGE_SIZE })}&offset=${pageParam}`,
        ),
      }),
      providesTags: (result) => [
        ...(result?.pages.flat().map((t) => ({ type: "Transaction" as const, id: t.id })) ?? []),
        { type: "Transaction", id: "LIST" },
      ],
    }),
    // One page with the total the filters match, so the website can page through every row.
    getTransactionPage: builder.query<TransactionListPage, TransactionPageParams>({
      query: ({ offset, ...params }) => ({
        url: pathWithQuery("/transactions/page", `${transactionListQuery(params)}&offset=${offset}`),
      }),
      providesTags: (result) => [
        ...(result?.items.map((t) => ({ type: "Transaction" as const, id: t.id })) ?? []),
        { type: "Transaction", id: "LIST" },
      ],
    }),
    // Every row the filters match, as "select all" ticks rows on pages not loaded yet. Fetched only
    // when triggered (select all, or checking ticks), so it provides no tag: an edit would otherwise
    // refetch every matching id for as long as the lazy query stays subscribed.
    listTransactionSelection: builder.query<TransactionSelectionRef[], TransactionListParams>({
      query: (params) => ({ url: pathWithQuery("/transactions/selection", transactionListQuery(params)) }),
    }),
    // The categories the matching rows have: the choices of the table's Category filter.
    listTransactionCategories: builder.query<string[], TransactionListParams>({
      query: (params) => ({ url: pathWithQuery("/transactions/categories", transactionListQuery(params)) }),
      providesTags: [{ type: "Transaction", id: "LIST" }],
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
    // A write that moves a Schedule E total marks unfiled tax returns out of date on the server,
    // so every such mutation refetches TaxReturn and the "Needs recompute" banner shows without a reload.
    updateTransaction: builder.mutation<TransactionUpdateResult, { id: string; data: Partial<Transaction> }>({
      query: ({ id, data }) => ({ url: `/transactions/${id}`, method: "PATCH", data }),
      invalidatesTags: ["Transaction", "Summary", "TaxReturn"],
    }),
    deleteTransaction: builder.mutation<void, string>({
      query: (id) => ({ url: `/transactions/${id}`, method: "DELETE" }),
      // Deleting a payment drops its pending rent receipt.
      invalidatesTags: ["Transaction", "Summary", RECEIPTS_PENDING_TAG, "TaxReturn"],
    }),
    importBankCsv: builder.mutation<ImportResult, BankCsvImportRequest>({
      query: ({ form, propertyId }) => ({
        url: "/imports/bank-csv",
        method: "POST",
        data: form,
        params: propertyId ? { property_id: propertyId } : undefined,
      }),
      // New rows change the list, the review count and every total built from them.
      invalidatesTags: ["Transaction", "Summary", "TaxReturn"],
    }),
    bulkApproveTransactions: builder.mutation<BulkApproveTransactionsResponse, string[]>({
      query: (ids) => ({ url: "/transactions/bulk-approve", method: "POST", data: { ids } }),
      invalidatesTags: ["Transaction", "Summary", "TaxReturn"],
    }),
    bulkDeleteTransactions: builder.mutation<BulkDeleteTransactionsResponse, string[]>({
      query: (ids) => ({ url: "/transactions/bulk-delete", method: "POST", data: { ids } }),
      // Deleting a payment drops its pending rent receipt.
      invalidatesTags: ["Transaction", "Summary", RECEIPTS_PENDING_TAG, "TaxReturn"],
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
      // Deleting a payment drops its pending rent receipt.
      invalidatesTags: ["Transaction", "Summary", RECEIPTS_PENDING_TAG, "TaxReturn"],
    }),
    dismissDuplicate: builder.mutation<{ reviewed: number }, { transaction_ids: string[] }>({
      query: (data) => ({ url: "/transactions/duplicates/dismiss", method: "POST", data }),
      invalidatesTags: [{ type: "Transaction", id: "DUPLICATES" }],
    }),
    mergeDuplicates: builder.mutation<MergeDuplicatesResponse, MergeDuplicatesRequest>({
      query: (data) => ({ url: "/transactions/duplicates/merge", method: "POST", data }),
      // Deleting a payment drops its pending rent receipt.
      invalidatesTags: ["Transaction", "Summary", RECEIPTS_PENDING_TAG, "TaxReturn"],
    }),
  }),
});

export const {
  useListTransactionsQuery,
  useListTransactionPagesInfiniteQuery,
  useGetTransactionPageQuery,
  useLazyListTransactionSelectionQuery,
  useListTransactionCategoriesQuery,
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
