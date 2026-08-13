import { baseApi } from "./baseApi";
import type { InsuranceBenchmark } from "@/shared/types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkUpsertRequest } from "@/shared/types/insurance/insurance-benchmark-upsert-request";
import type { InsurancePremiumComparison } from "@/shared/types/insurance/insurance-premium-comparison";

/**
 * RTK Query slice for the insurance benchmark and the comparison it drives.
 *
 * The benchmark is a singleton per organization, so there is no id in any of
 * these routes and one cache entry covers the whole slice.
 *
 * The comparison is tagged ``InsurancePolicy:COMPARISON`` rather than under
 * this slice's own tag because it is derived from *both* sides — editing a
 * policy's premium must refresh it just as recording a new benchmark does.
 * Benchmark mutations invalidate both tags for that reason.
 */
const insuranceBenchmarksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInsuranceBenchmark: builder.query<InsuranceBenchmark | null, void>({
      query: () => ({ url: "/insurance-benchmarks" }),
      providesTags: [{ type: "InsuranceBenchmark", id: "CURRENT" }],
    }),

    getInsurancePremiumComparison: builder.query<InsurancePremiumComparison, void>({
      query: () => ({ url: "/insurance-policies/premium-comparison" }),
      providesTags: [{ type: "InsurancePolicy", id: "COMPARISON" }],
    }),

    upsertInsuranceBenchmark: builder.mutation<
      InsuranceBenchmark,
      InsuranceBenchmarkUpsertRequest
    >({
      query: (data) => ({ url: "/insurance-benchmarks", method: "PUT", data }),
      invalidatesTags: [
        { type: "InsuranceBenchmark", id: "CURRENT" },
        { type: "InsurancePolicy", id: "COMPARISON" },
      ],
    }),

    deleteInsuranceBenchmark: builder.mutation<void, void>({
      query: () => ({ url: "/insurance-benchmarks", method: "DELETE" }),
      invalidatesTags: [
        { type: "InsuranceBenchmark", id: "CURRENT" },
        { type: "InsurancePolicy", id: "COMPARISON" },
      ],
    }),
  }),
});

export const {
  useGetInsuranceBenchmarkQuery,
  useGetInsurancePremiumComparisonQuery,
  useUpsertInsuranceBenchmarkMutation,
  useDeleteInsuranceBenchmarkMutation,
} = insuranceBenchmarksApi;
