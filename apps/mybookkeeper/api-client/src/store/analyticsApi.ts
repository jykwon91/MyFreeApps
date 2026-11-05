import { baseApi } from "@platform/core/store/baseApi";
import type { UtilityTrendsParams } from "../types/analytics/utility-trends-params";
import type { UtilityTrendsResponse } from "../types/analytics/utility-trends-response";

const analyticsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Transaction"],
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
  }),
});

export const { useGetUtilityTrendsQuery } = analyticsApi;
