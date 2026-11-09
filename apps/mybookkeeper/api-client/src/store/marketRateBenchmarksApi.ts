import { localToday } from "../utils/localToday";
import { baseApi } from "@platform/core/store/baseApi";
import type { MarketRateBenchmark } from "../types/utility/market-rate-benchmark";
import type { MarketRateBenchmarkUpsertRequest } from "../types/utility/market-rate-benchmark-upsert-request";
import type { UtilityServiceType } from "../types/utility/utility-service-type";

/**
 * RTK Query slice for market rate benchmarks.
 *
 * The comparison they drive is served by the api-client's ``utilityPlansApi``
 * and tagged ``UtilityPlan:COMPARISON``, because it is derived from *both*
 * sides — editing a plan's rate must refresh it just as recording a new
 * benchmark does. Benchmark mutations invalidate both tags for that reason.
 */
export const marketRateBenchmarksApi = baseApi.enhanceEndpoints({
  addTagTypes: ["UtilityPlan", "MarketRateBenchmark"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getMarketRateBenchmarks: builder.query<MarketRateBenchmark[], void>({
      query: () => ({ url: "/market-rate-benchmarks", params: { today: localToday() } }),
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

    upsertMarketRateBenchmark: builder.mutation<
      MarketRateBenchmark,
      { serviceType: UtilityServiceType; data: Omit<MarketRateBenchmarkUpsertRequest, "today"> }
    >({
      query: ({ serviceType, data }) => {
        const body: MarketRateBenchmarkUpsertRequest = { ...data, today: localToday() };
        return { url: `/market-rate-benchmarks/${serviceType}`, method: "PUT", data: body };
      },
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
  useUpsertMarketRateBenchmarkMutation,
  useDeleteMarketRateBenchmarkMutation,
} = marketRateBenchmarksApi;
