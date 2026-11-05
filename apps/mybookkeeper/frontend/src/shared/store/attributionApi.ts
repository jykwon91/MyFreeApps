import { baseApi } from "./baseApi";
import type { PropertyPnLResponse } from "@/shared/types/attribution/property-pnl";

const attributionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
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
  useAttributeTransactionManuallyMutation,
  useGetPropertyPnlQuery,
} = attributionApi;
