import { baseApi } from "./baseApi";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";
import type { MarketRateBenchmarkUpsertRequest } from "@/shared/types/utility/market-rate-benchmark-upsert-request";
import type { UtilityPlanRateComparison } from "@/shared/types/utility/utility-plan-rate-comparison";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * RTK Query slice for market rate benchmarks and the comparison they drive.
 *
 * The comparison is tagged ``UtilityPlan:COMPARISON`` rather than under this
 * slice's own tag because it is derived from *both* sides — editing a plan's
 * rate must refresh it just as recording a new benchmark does. Benchmark
 * mutations invalidate both tags for that reason.
 */
const marketRateBenchmarksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMarketRateBenchmarks: builder.query<MarketRateBenchmark[], void>({
      query: () => ({ url: "/market-rate-benchmarks" }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((b) => ({
                type: "MarketRateBenchmark" as const,
                id: b.service_type,
              })),
              { type: "MarketRateBenchmark" as const, id: "LIST" },
            ]
          : [{ type: "MarketRateBenchmark" as const, id: "LIST" }],
    }),

    getUtilityPlanRateComparison: builder.query<UtilityPlanRateComparison, void>({
      query: () => ({ url: "/utility-plans/rate-comparison" }),
      providesTags: [{ type: "UtilityPlan", id: "COMPARISON" }],
    }),

    upsertMarketRateBenchmark: builder.mutation<
      MarketRateBenchmark,
      { serviceType: UtilityServiceType; data: MarketRateBenchmarkUpsertRequest }
    >({
      query: ({ serviceType, data }) => ({
        url: `/market-rate-benchmarks/${serviceType}`,
        method: "PUT",
        data,
      }),
      invalidatesTags: (_r, _e, { serviceType }) => [
        { type: "MarketRateBenchmark", id: serviceType },
        { type: "MarketRateBenchmark", id: "LIST" },
        { type: "UtilityPlan", id: "COMPARISON" },
      ],
    }),

    deleteMarketRateBenchmark: builder.mutation<void, UtilityServiceType>({
      query: (serviceType) => ({
        url: `/market-rate-benchmarks/${serviceType}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, serviceType) => [
        { type: "MarketRateBenchmark", id: serviceType },
        { type: "MarketRateBenchmark", id: "LIST" },
        { type: "UtilityPlan", id: "COMPARISON" },
      ],
    }),
  }),
});

export const {
  useGetMarketRateBenchmarksQuery,
  useGetUtilityPlanRateComparisonQuery,
  useUpsertMarketRateBenchmarkMutation,
  useDeleteMarketRateBenchmarkMutation,
} = marketRateBenchmarksApi;
