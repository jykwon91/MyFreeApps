import { baseApi } from "./baseApi";
import type { UtilityTrendsResponse } from "@/shared/types/analytics";

export interface UtilityTrendsParams {
  startDate?: string;
  endDate?: string;
  propertyIds?: string[];
  granularity?: "monthly" | "quarterly";
}

const analyticsApi = baseApi.injectEndpoints({
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
