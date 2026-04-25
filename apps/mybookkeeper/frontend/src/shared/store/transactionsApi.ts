import { baseApi } from "./baseApi";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DuplicatePairsResponse, MergeDuplicatesRequest, MergeDuplicatesResponse } from "@/shared/types/transaction/duplicate";

export interface TransactionListParams {
  property_id?: string;
  status?: string;
  transaction_type?: string;
  category?: string;
  vendor?: string;
  start_date?: string;
  end_date?: string;
  tax_year?: number;
  reconciled?: boolean;
}

export interface ScheduleEReport {
  tax_year: number;
  properties: ScheduleEProperty[];
  totals: Record<string, string>;
}

export interface ScheduleEProperty {
  property_id: string;
  property_name: string;
  lines: Record<string, string>;
}

const transactionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransactions: builder.query<Transaction[], TransactionListParams>({
      query: (params = {}) => ({ url: "/transactions", params: { ...params } }),
      providesTags: (result) =>
        result
          ? [...result.map((t) => ({ type: "Transaction" as const, id: t.id })), { type: "Transaction", id: "LIST" }]
          : [{ type: "Transaction", id: "LIST" }],
    }),
    getTransaction: builder.query<Transaction, string>({
      query: (id) => ({ url: `/transactions/${id}` }),
      providesTags: (_result, _err, id) => [{ type: "Transaction", id }],
    }),
    createTransaction: builder.mutation<Transaction, Partial<Transaction>>({
      query: (data) => ({ url: "/transactions", method: "POST", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    updateTransaction: builder.mutation<Transaction & { retroactive_count?: number }, { id: string; data: Partial<Transaction> }>({
      query: ({ id, data }) => ({ url: `/transactions/${id}`, method: "PATCH", data }),
      invalidatesTags: ["Transaction", "Summary"],
    }),
    deleteTransaction: builder.mutation<void, string>({
      query: (id) => ({ url: `/transactions/${id}`, method: "DELETE" }),
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
} = transactionsApi;
