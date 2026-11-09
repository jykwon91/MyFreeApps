import { localToday } from "../utils/localToday";
import { baseApi } from "@platform/core/store/baseApi";
import type { MortgageRateWatch } from "../types/mortgage/mortgage-rate-watch";

/**
 * RTK Query slice for the mortgage rate check.
 *
 * Its own slice rather than an endpoint on ``mortgagesApi``: this one reaches
 * out to Freddie Mac, and the loan list must never inherit a third party's
 * latency. Tagged under ``Mortgage:RATE_WATCH`` so editing a rate or a balance
 * clears the verdict that was computed from the old figure.
 */
export const mortgageMarketApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Mortgage"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getMortgageRateWatch: builder.query<MortgageRateWatch, void>({
      query: () => ({ url: "/mortgage-market/rate-watch", params: { today: localToday() } }),
      providesTags: [{ type: "Mortgage", id: "RATE_WATCH" }],
    }),
  }),
});

export const {
  useGetMortgageRateWatchQuery,
  useLazyGetMortgageRateWatchQuery,
} = mortgageMarketApi;
