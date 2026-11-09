import { baseApi } from "@platform/core/store/baseApi";
import type { AttributeTransactionRequest } from "../types/attribution/attribute-transaction-request";
import type { AttributionReviewQueueResponse } from "../types/attribution/attribution-review-queue-response";
import type { PropertyPnLRange } from "../types/attribution/property-pnl-range";
import type { PropertyPnLResponse } from "../types/attribution/property-pnl-response";

const QUEUE_TAG = { type: "Transaction", id: "ATTRIBUTION_QUEUE" } as const;

/** Takes the row off the list as soon as it's done, so it can't be tapped again while the list reloads. */
function withoutReview(reviewId: string) {
  return (queue: AttributionReviewQueueResponse) => {
    const remaining = queue.items.filter((item) => item.id !== reviewId);
    queue.pending_count = Math.max(0, queue.pending_count - (queue.items.length - remaining.length));
    queue.items = remaining;
  };
}

export const attributionApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Summary", "Transaction"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getAttributionReviewQueue: builder.query<
      AttributionReviewQueueResponse,
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({
        url: "/transactions/attribution-review-queue",
        params: params ?? {},
      }),
      providesTags: [QUEUE_TAG],
    }),
    confirmAttributionReview: builder.mutation<
      { ok: boolean; transaction_id: string },
      { review_id: string; applicant_id?: string; property_id?: string }
    >({
      query: ({ review_id, applicant_id, property_id }) => ({
        url: `/transactions/attribution-review-queue/${review_id}/confirm`,
        method: "POST",
        data: {
          applicant_id: applicant_id ?? null,
          property_id: property_id ?? null,
        },
      }),
      onQueryStarted: async ({ review_id }, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          dispatch(attributionApi.util.updateQueryData("getAttributionReviewQueue", undefined, withoutReview(review_id)));
        } catch {
          // The caller reports the failure, and the row stays.
        }
      },
      invalidatesTags: (result) => [
        QUEUE_TAG,
        { type: "Transaction", id: "LIST" },
        { type: "Transaction", id: "REVIEW_COUNT" },
        ...(result ? [{ type: "Transaction" as const, id: result.transaction_id }] : []),
        "Summary",
      ],
    }),
    rejectAttributionReview: builder.mutation<{ ok: boolean }, { review_id: string }>({
      query: ({ review_id }) => ({
        url: `/transactions/attribution-review-queue/${review_id}/reject`,
        method: "POST",
        data: {},
      }),
      onQueryStarted: async ({ review_id }, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          dispatch(attributionApi.util.updateQueryData("getAttributionReviewQueue", undefined, withoutReview(review_id)));
        } catch {
          // The caller reports the failure, and the row stays.
        }
      },
      invalidatesTags: [QUEUE_TAG],
    }),
    attributeTransactionManually: builder.mutation<{ ok: boolean; transaction_id: string }, AttributeTransactionRequest>({
      query: ({ transaction_id, applicant_id }) => ({
        url: `/transactions/${transaction_id}/attribute`,
        method: "POST",
        data: { applicant_id },
      }),
      invalidatesTags: (_result, _err, { transaction_id }) => [
        { type: "Transaction", id: transaction_id },
        { type: "Transaction", id: "LIST" },
        QUEUE_TAG,
        "Summary",
      ],
    }),
    getPropertyPnl: builder.query<PropertyPnLResponse, PropertyPnLRange>({
      query: ({ since, until }) => ({ url: "/dashboard/property-pnl", params: { since, until } }),
      providesTags: ["Summary"],
    }),
  }),
});

export const {
  useGetAttributionReviewQueueQuery,
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
  useAttributeTransactionManuallyMutation,
  useGetPropertyPnlQuery,
} = attributionApi;
