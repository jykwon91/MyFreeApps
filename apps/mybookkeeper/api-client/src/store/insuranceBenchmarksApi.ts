import { localToday } from "../utils/localToday";
import { baseApi } from "@platform/core/store/baseApi";
import type { InsuranceBenchmark } from "../types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkUpsertRequest } from "../types/insurance/insurance-benchmark-upsert-request";

/**
 * RTK Query slice for the insurance benchmark. The premium comparison it drives
 * is served by the api-client's ``insurancePoliciesApi``.
 *
 * The benchmark is a singleton per organization, so there is no id in any of
 * these routes and one cache entry covers the whole slice.
 *
 * That comparison is tagged ``InsurancePolicy:COMPARISON`` rather than under
 * this slice's own tag because it is derived from *both* sides — editing a
 * policy's premium must refresh it just as recording a new benchmark does.
 * Benchmark mutations invalidate both tags for that reason.
 */
export const insuranceBenchmarksApi = baseApi.enhanceEndpoints({
  addTagTypes: ["InsuranceBenchmark", "InsurancePolicy"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getInsuranceBenchmark: builder.query<InsuranceBenchmark | null, void>({
      query: () => ({ url: "/insurance-benchmarks", params: { today: localToday() } }),
      providesTags: [{ type: "InsuranceBenchmark", id: "CURRENT" }],
    }),

    upsertInsuranceBenchmark: builder.mutation<
      InsuranceBenchmark,
      Omit<InsuranceBenchmarkUpsertRequest, "today">
    >({
      query: (fields) => {
        const data: InsuranceBenchmarkUpsertRequest = { ...fields, today: localToday() };
        return { url: "/insurance-benchmarks", method: "PUT", data };
      },
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
  useUpsertInsuranceBenchmarkMutation,
  useDeleteInsuranceBenchmarkMutation,
} = insuranceBenchmarksApi;
