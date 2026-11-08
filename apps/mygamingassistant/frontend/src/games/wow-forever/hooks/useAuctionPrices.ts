import { useGetWowPricesQuery } from "@/games/wow-forever/api/wowPricesApi";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

export type AuctionPricesStatus = "loading" | "error" | "ready";

export interface AuctionPricesState {
  status: AuctionPricesStatus;
  /** Null while loading or after an error, so every price reads as unknown. */
  prices: AuctionPrices | null;
  retry: () => void;
  retrying: boolean;
}

// Many rows on a page ask for prices at once. Map each response once, not once per row.
const mapped = new WeakMap<PriceListResponse, AuctionPrices>();

function mapOnce(response: PriceListResponse): AuctionPrices {
  const hit = mapped.get(response);
  if (hit) return hit;
  const prices = mapPriceList(response);
  mapped.set(response, prices);
  return prices;
}

/**
 * The US auction-house prices (the only region the site keeps). Every caller shares one
 * request and one cache. Nobody types anything: the server keeps the prices up to date.
 */
export function useAuctionPrices(): AuctionPricesState {
  const { data, isError, isFetching, refetch } = useGetWowPricesQuery();
  const retry = () => void refetch();
  if (data) return { status: "ready", prices: mapOnce(data), retry, retrying: false };
  if (isError) return { status: "error", prices: null, retry, retrying: isFetching };
  return { status: "loading", prices: null, retry, retrying: false };
}
