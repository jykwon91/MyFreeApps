import { EXPORT_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { baseApi } from "@platform/core/store/baseApi";
import { PENDING_RECEIPT_PAGE_SIZE } from "../constants/receiptPaging";
import { RECEIPTS_PENDING_TAG as PENDING_TAG } from "../constants/receiptsPendingTag";
import type { PendingReceiptListArgs } from "../types/lease/pending-receipt-list-args";
import type { PendingReceiptListResponse } from "../types/lease/pending-receipt-list-response";
import type { PendingReceiptLookupResponse } from "../types/lease/pending-receipt-lookup-response";
import type { SendReceiptRequest } from "../types/lease/send-receipt-request";
import type { SendReceiptResponse } from "../types/lease/send-receipt-response";
import { localToday } from "@platform/core/utils/localToday";


/** RTK Query slice for rent receipts waiting to be sent. */
export const rentReceiptsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["SignedLease", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    /** One page's worth, read for its counts: the phone's home screen asks for one row and reads `pending_count`. */
    getPendingReceipts: builder.query<PendingReceiptListResponse, PendingReceiptListArgs | void>({
      query: (params) => ({
        url: "/rent-receipts/pending",
        params: params ?? {},
      }),
      providesTags: [PENDING_TAG],
    }),

    listPendingReceiptPages: builder.infiniteQuery<PendingReceiptListResponse, void, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + PENDING_RECEIPT_PAGE_SIZE : undefined,
      },
      query: ({ pageParam }) => ({
        url: "/rent-receipts/pending",
        params: { limit: PENDING_RECEIPT_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: [PENDING_TAG],
    }),

    /** One payment's open receipt, so a screen opened on it never depends on which page it's on. */
    getPendingReceipt: builder.query<PendingReceiptLookupResponse, string>({
      query: (transactionId) => ({ url: `/rent-receipts/pending/${transactionId}` }),
      providesTags: [PENDING_TAG],
    }),

    sendReceipt: builder.mutation<
      SendReceiptResponse,
      { transaction_id: string; data: Omit<SendReceiptRequest, "today"> }
    >({
      query: ({ transaction_id, data }) => {
        const body: SendReceiptRequest = { ...data, today: localToday() };
        return { url: `/rent-receipts/${transaction_id}/send`, method: "POST", data: body, timeout: EXPORT_REQUEST_TIMEOUT_MS };
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
  useListPendingReceiptPagesInfiniteQuery,
  useGetPendingReceiptQuery,
  useSendReceiptMutation,
  useDismissReceiptMutation,
} = rentReceiptsApi;
