import { baseApi } from "@platform/core/store/baseApi";
import { patchCacheAfterSuccess } from "@platform/core/store/patchCacheAfterSuccess";
import { RECEIPTS_PENDING_TAG } from "../constants/receiptsPendingTag";
import type { AttributionReviewQueueResponse } from "../types/attribution/attribution-review-queue-response";
import type { PersonalTransferMarkResult } from "../types/personal-transfer/personal-transfer-mark-result";
import type { PersonalTransferSender } from "../types/personal-transfer/personal-transfer-sender";
import type { PersonalTransferUnmarkRequest } from "../types/personal-transfer/personal-transfer-unmark-request";
import type { PersonalTransferUnmarkResult } from "../types/personal-transfer/personal-transfer-unmark-result";
import { attributionApi } from "./attributionApi";

const SENDERS_TAG = { type: "PersonalTransferSender", id: "LIST" } as const;

// A personal transfer leaves every total, so each view built from them reloads.
// "Transaction" covers the list, the review count and the Payment Review queue.
const TOTALS_TAGS = ["Transaction", "Summary", "TaxReturn", "RentLedger", "CashFlow", "Budget", RECEIPTS_PENDING_TAG] as const;

/** Takes the payment's card off Payment Review as soon as it's marked, so it can't be tapped again while the list reloads. */
function withoutTransaction(transactionId: string) {
  return (queue: AttributionReviewQueueResponse) => {
    const remaining = queue.items.filter((item) => item.transaction_id !== transactionId);
    queue.pending_count = Math.max(0, queue.pending_count - (queue.items.length - remaining.length));
    queue.items = remaining;
  };
}

export const personalTransferApi = baseApi.enhanceEndpoints({
  addTagTypes: ["PersonalTransferSender", "Transaction", "Summary", "TaxReturn", "RentLedger", "CashFlow", "Budget", "SignedLease"],
}).injectEndpoints({
  endpoints: (builder) => ({
    markPersonalTransfer: builder.mutation<PersonalTransferMarkResult, string>({
      query: (transactionId) => ({ url: `/transactions/${transactionId}/personal-transfer`, method: "PUT" }),
      onQueryStarted: (transactionId, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, () => {
          dispatch(
            attributionApi.util.updateQueryData("getAttributionReviewQueue", undefined, withoutTransaction(transactionId)),
          );
        }),
      invalidatesTags: [...TOTALS_TAGS, SENDERS_TAG],
    }),
    unmarkPersonalTransfer: builder.mutation<PersonalTransferUnmarkResult, PersonalTransferUnmarkRequest>({
      query: ({ transaction_id, forget_sender }) => ({
        url: `/transactions/${transaction_id}/personal-transfer/undo`,
        method: "POST",
        data: { forget_sender },
      }),
      invalidatesTags: [...TOTALS_TAGS, SENDERS_TAG],
    }),
    getPersonalTransferSenders: builder.query<PersonalTransferSender[], void>({
      query: () => ({ url: "/personal-transfer-senders" }),
      providesTags: [SENDERS_TAG],
    }),
    forgetPersonalTransferSender: builder.mutation<void, string>({
      query: (senderId) => ({ url: `/personal-transfer-senders/${senderId}`, method: "DELETE" }),
      onQueryStarted: (senderId, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, () => {
          dispatch(
            personalTransferApi.util.updateQueryData("getPersonalTransferSenders", undefined, (senders) =>
              senders.filter((s) => s.id !== senderId),
            ),
          );
        }),
      invalidatesTags: [SENDERS_TAG],
    }),
  }),
});

export const {
  useMarkPersonalTransferMutation,
  useUnmarkPersonalTransferMutation,
  useGetPersonalTransferSendersQuery,
  useForgetPersonalTransferSenderMutation,
} = personalTransferApi;
