import { baseApi } from "./baseApi";
import type { InsuranceMarketWatch } from "@/shared/types/insurance/insurance-market-watch";

/**
 * RTK Query slice for the Texas dwelling rate watch.
 *
 * Tagged under `InsurancePolicy:RATE_WATCH` because every outlook is measured
 * against a policy on file — changing a policy's carrier or expiration changes
 * which filings apply to it, so policy mutations must be able to invalidate
 * this.
 *
 * The query is lazy: it reaches out to the Department of Insurance, and a page
 * view is not a reason to hit an external service.
 */
const insuranceMarketApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInsuranceRateWatch: builder.query<InsuranceMarketWatch, void>({
      query: () => ({ url: "/insurance-market/rate-watch" }),
      providesTags: [{ type: "InsurancePolicy", id: "RATE_WATCH" }],
    }),
  }),
});

export const {
  useGetInsuranceRateWatchQuery,
  useLazyGetInsuranceRateWatchQuery,
} = insuranceMarketApi;
