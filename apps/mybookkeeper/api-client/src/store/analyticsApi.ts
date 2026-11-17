import { baseApi } from "@platform/core/store/baseApi";
import type { RentalRoiParams } from "../types/analytics/rental-roi-params";
import type { RentalRoiResponse } from "../types/analytics/rental-roi-response";
import type { UtilityTrendsParams } from "../types/analytics/utility-trends-params";
import type { UtilityTrendsResponse } from "../types/analytics/utility-trends-response";

const analyticsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Transaction", "Mortgage"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getUtilityTrends: builder.query<UtilityTrendsResponse, UtilityTrendsParams | void>({
      query: (params) => ({
        url: "/analytics/utility-trends",
        params: params
          ? {
              start_date: params.startDate,
              end_date: params.endDate,
              property_ids: params.propertyIds?.join(","),
              granularity: params.granularity,
            }
          : {},
      }),
      providesTags: ["Transaction"],
    }),
    // Property edits (a new purchase price) invalidate "Transaction" too; loan
    // records change break-even, so any mortgage write refetches this.
    getRentalRoi: builder.query<RentalRoiResponse, RentalRoiParams>({
      query: ({ targetReturnPct }) => ({
        url: "/analytics/rental-roi",
        params: { target_return_pct: targetReturnPct },
      }),
      providesTags: ["Transaction", { type: "Mortgage", id: "LIST" }],
    }),
  }),
});

export const { useGetUtilityTrendsQuery, useGetRentalRoiQuery } = analyticsApi;
