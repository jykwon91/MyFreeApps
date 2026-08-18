import { baseApi } from "./baseApi";
import type { MortgageRateWatch } from "@/shared/types/mortgage/mortgage-rate-watch";

/**
 * RTK Query slice for the mortgage rate check.
 *
 * Its own slice rather than an endpoint on ``mortgagesApi``: this one reaches
 * out to Freddie Mac, and the loan list must never inherit a third party's
 * latency. Tagged under ``Mortgage:RATE_WATCH`` so editing a rate or a balance
 * clears the verdict that was computed from the old figure.
 */
const mortgageMarketApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMortgageRateWatch: builder.query<MortgageRateWatch, void>({
      query: () => ({ url: "/mortgage-market/rate-watch" }),
      providesTags: [{ type: "Mortgage", id: "RATE_WATCH" }],
    }),
  }),
});

export const {
  useGetMortgageRateWatchQuery,
  useLazyGetMortgageRateWatchQuery,
} = mortgageMarketApi;
