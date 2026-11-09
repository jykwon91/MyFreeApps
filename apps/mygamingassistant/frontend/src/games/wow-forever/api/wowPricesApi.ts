import { baseApi } from "@platform/ui";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

/** Prices change every few hours at most, so a page keeps the ones it has for 10 minutes. */
const PRICES_CACHE_SECONDS = 600;

export const wowPricesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getWowPrices: build.query<PriceListResponse, PriceHouse>({
      query: ({ server, faction }) => ({ url: "/wow/prices", method: "GET", params: { server, faction } }),
      keepUnusedDataFor: PRICES_CACHE_SECONDS,
    }),
  }),
});

export const { useGetWowPricesQuery } = wowPricesApi;
