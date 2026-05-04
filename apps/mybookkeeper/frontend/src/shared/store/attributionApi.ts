import { baseApi } from "./baseApi";
import type { AttributionReviewQueueResponse } from "@/shared/types/attribution/attribution-review";
import type { PropertyPnLResponse } from "@/shared/types/attribution/property-pnl";

const attributionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAttributionReviewQueue: builder.query<
      AttributionReviewQueueResponse,
      { limit?: number; offset?: number } | void
    >({
      query: (params) => ({
        url: "/transactions/attribution-review-queue",
        params: params ?? {},
      }),
      providesTags: [{ type: "Transaction", id: "ATTRIBUTION_QUEUE" }],
    }),

    confirmAttributionReview: builder.mutation<
      { ok: boolean; transaction_id: string },
      { review_id: string; applicant_id?: string }
    >({
      query: ({ review_id, applicant_id }) => ({
        url: `/transactions/attribution-review-queue/${review_id}/confirm`,
        method: "POST",
        data: { applicant_id: applicant_id ?? null },
      }),
      invalidatesTags: [
        { type: "Transaction", id: "ATTRIBUTION_QUEUE" },
        { type: "Transaction", id: "LIST" },
        "Summary",
      ],
    }),

    rejectAttributionReview: builder.mutation<
      { ok: boolean },
      { review_id: string }
    >({
      query: ({ review_id }) => ({
        url: `/transactions/attribution-review-queue/${review_id}/reject`,
        method: "POST",
        data: {},
      }),
      invalidatesTags: [{ type: "Transaction", id: "ATTRIBUTION_QUEUE" }],
    }),

    attributeTransactionManually: builder.mutation<
      { ok: boolean; transaction_id: string },
      { transaction_id: string; applicant_id: string }
    >({
      query: ({ transaction_id, applicant_id }) => ({
        url: `/transactions/${transaction_id}/attribute`,
        method: "POST",
        data: { applicant_id },
      }),
      invalidatesTags: (_result, _err, { transaction_id }) => [
        { type: "Transaction", id: transaction_id },
        { type: "Transaction", id: "LIST" },
        { type: "Transaction", id: "ATTRIBUTION_QUEUE" },
        "Summary",
      ],
    }),

    getPropertyPnl: builder.query<
      PropertyPnLResponse,
      { since: string; until: string }
    >({
      query: ({ since, until }) => ({
        url: "/dashboard/property-pnl",
        params: { since, until },
      }),
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
