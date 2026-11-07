import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import { baseApi } from "./baseApi";
import type { UtilityOfferSearchResponse } from "@/shared/types/utility/utility-offer-search-response";

/**
 * RTK Query slice for the live market-offer search.
 *
 * Tagged under `UtilityPlan:OFFERS` because the ranking is measured against the
 * plans currently on file — editing a plan's rate changes which offers beat it,
 * so plan mutations must be able to invalidate this.
 *
 * The query is lazy: it fans out to the Power to Choose feed once per distinct
 * property ZIP, so it runs when the operator asks for it rather than on every
 * page load.
 */
const utilityOffersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    findBetterUtilityPlans: builder.query<
      UtilityOfferSearchResponse,
      { minTermMonths?: number } | void
    >({
      query: (args) => ({
        url: "/utility-plans/offers",
        params: {
          today: localToday(),
          ...(args?.minTermMonths ? { min_term_months: args.minTermMonths } : {}),
        },
      }),
      providesTags: [{ type: "UtilityPlan", id: "OFFERS" }],
    }),
  }),
});

export const {
  useFindBetterUtilityPlansQuery,
  useLazyFindBetterUtilityPlansQuery,
} = utilityOffersApi;
