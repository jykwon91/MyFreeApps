import { baseApi } from "@platform/core/store/baseApi";
import type { PendingReceiptListArgs } from "../types/lease/pending-receipt-list-args";
import type { PendingReceiptListResponse } from "../types/lease/pending-receipt-list-response";
import type { SendReceiptRequest } from "../types/lease/send-receipt-request";
import type { SendReceiptResponse } from "../types/lease/send-receipt-response";
import { localToday } from "../utils/localToday";

const PENDING_TAG = { type: "SignedLease", id: "RECEIPTS_PENDING" } as const;

/** RTK Query slice for rent receipts waiting to be sent. */
export const rentReceiptsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["SignedLease", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getPendingReceipts: builder.query<PendingReceiptListResponse, PendingReceiptListArgs | void>({
      query: (params) => ({
        url: "/rent-receipts/pending",
        params: params ?? {},
      }),
      providesTags: [PENDING_TAG],
    }),

    sendReceipt: builder.mutation<
      SendReceiptResponse,
      { transaction_id: string; data: Omit<SendReceiptRequest, "today"> }
    >({
      query: ({ transaction_id, data }) => {
        const body: SendReceiptRequest = { ...data, today: localToday() };
        return { url: `/rent-receipts/${transaction_id}/send`, method: "POST", data: body };
      },
      invalidatesTags: (_result, _err, { transaction_id }) => [
        PENDING_TAG,
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
      invalidatesTags: [PENDING_TAG],
    }),
  }),
});

export const {
  useGetPendingReceiptsQuery,
  useSendReceiptMutation,
  useDismissReceiptMutation,
} = rentReceiptsApi;
