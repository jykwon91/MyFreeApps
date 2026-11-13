import { baseApi } from "@platform/ui";
import { PRICE_REFRESH_POLL_MS, PRICE_REFRESH_WATCH_TIMEOUT_MS } from "@/games/wow-forever/data/priceRefreshConfig";
import { refreshOutcome } from "@/games/wow-forever/prices/priceRefresh";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { PriceRefreshBaseline } from "@/games/wow-forever/types/priceRefreshBaseline";
import type { PriceRefreshResponse } from "@/games/wow-forever/types/priceRefreshResponse";
import type { PriceRefreshState } from "@/games/wow-forever/types/priceRefreshState";

/** Prices change every few hours at most, so a page keeps the ones it has for 10 minutes. */
const PRICES_CACHE_SECONDS = 600;

export const wowPricesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getWowPrices: build.query<PriceListResponse, PriceHouse>({
      query: ({ server, faction }) => ({ url: "/wow/prices", method: "GET", params: { server, faction } }),
      keepUnusedDataFor: PRICES_CACHE_SECONDS,
    }),
    /** The house's refresh state. The server never caches it, so a poll sees a refresh land. */
    getWowPriceRefreshState: build.query<PriceRefreshState, PriceHouse>({
      query: ({ server, faction }) => ({ url: "/wow/prices/refresh", method: "GET", params: { server, faction } }),
    }),
    /** "Refresh now": the server pulls this one house from Blizzard after answering. */
    refreshWowPrices: build.mutation<PriceRefreshResponse, PriceHouse>({
      query: ({ server, faction }) => ({ url: "/wow/prices/refresh", method: "POST", params: { server, faction } }),
    }),
    /**
     * Read the house's prices past the browser's 10-minute cache (`no-cache` makes it check with the
     * server) and put them in the shared `getWowPrices` cache, so every priced surface shows the new set.
     */
    loadFreshWowPrices: build.mutation<PriceListResponse, PriceHouse>({
      query: ({ server, faction }) => ({
        url: "/wow/prices",
        method: "GET",
        params: { server, faction },
        headers: { "Cache-Control": "no-cache" },
      }),
      async onQueryStarted(house, { dispatch, queryFulfilled }) {
        // A failed read leaves the cache as it is; the caller of the mutation reports it.
        const fresh = await queryFulfilled.catch(() => null);
        if (fresh) dispatch(wowPricesApi.util.upsertQueryData("getWowPrices", house, fresh.data));
      },
    }),
    /**
     * Finish a refresh the page walked away from (another house was picked, or the page closed): keep
     * reading the house's state until the refresh lands and, if it brought new prices, load them past
     * the browser cache, so the next visit to that house doesn't show the old set.
     */
    finishPriceRefresh: build.mutation<null, { house: PriceHouse; baseline: PriceRefreshBaseline }>({
      async queryFn({ house, baseline }, { dispatch }) {
        const giveUpAt = Date.now() + PRICE_REFRESH_WATCH_TIMEOUT_MS;
        while (Date.now() < giveUpAt) {
          await new Promise((resolve) => setTimeout(resolve, PRICE_REFRESH_POLL_MS));
          const state = await dispatch(
            wowPricesApi.endpoints.getWowPriceRefreshState.initiate(house, { forceRefetch: true, subscribe: false }),
          ).unwrap();
          const outcome = refreshOutcome(baseline, state);
          if (outcome === "pending") continue;
          if (outcome === "updated") await dispatch(wowPricesApi.endpoints.loadFreshWowPrices.initiate(house)).unwrap();
          break;
        }
        return { data: null };
      },
    }),
  }),
});

export const {
  useGetWowPricesQuery,
  useGetWowPriceRefreshStateQuery,
  useRefreshWowPricesMutation,
  useLoadFreshWowPricesMutation,
  useFinishPriceRefreshMutation,
} = wowPricesApi;
