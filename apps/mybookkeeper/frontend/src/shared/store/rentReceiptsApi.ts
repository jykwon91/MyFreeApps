import { baseApi } from "./baseApi";
import type {
  PendingReceiptListResponse,
  SendReceiptRequest,
  SendReceiptResponse,
} from "@/shared/types/lease/pending-receipt";

const rentReceiptsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPendingReceipts: builder.query<
      PendingReceiptListResponse,
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({
        url: "/rent-receipts/pending",
        params: params ?? {},
      }),
      providesTags: [{ type: "SignedLease", id: "RECEIPTS_PENDING" }],
    }),

    sendReceipt: builder.mutation<
      SendReceiptResponse,
      { transaction_id: string; data: SendReceiptRequest }
    >({
      query: ({ transaction_id, data }) => ({
        url: `/rent-receipts/${transaction_id}/send`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, { transaction_id }) => [
        { type: "SignedLease", id: "RECEIPTS_PENDING" },
        { type: "Transaction", id: transaction_id },
        { type: "Transaction", id: "LIST" },
        "SignedLease",
      ],
    }),

    dismissReceipt: builder.mutation<void, { transaction_id: string }>({
      query: ({ transaction_id }) => ({
        url: `/rent-receipts/${transaction_id}/dismiss`,
        method: "POST",
        data: {},
      }),
      invalidatesTags: [{ type: "SignedLease", id: "RECEIPTS_PENDING" }],
    }),
  }),
});

export const {
  useGetPendingReceiptsQuery,
  useSendReceiptMutation,
  useDismissReceiptMutation,
} = rentReceiptsApi;