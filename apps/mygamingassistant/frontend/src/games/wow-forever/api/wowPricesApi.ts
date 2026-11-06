import { baseApi } from "@platform/ui";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/** Prices change every few hours at most, so a page keeps the ones it has for 10 minutes. */
const PRICES_CACHE_SECONDS = 600;

const wowPricesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getWowPrices: build.query<PriceListResponse, WowRegion>({
      query: (region) => ({ url: `/wow/prices?region=${region}`, method: "GET" }),
      keepUnusedDataFor: PRICES_CACHE_SECONDS,
    }),
  }),
});

export const { useGetWowPricesQuery } = wowPricesApi;
