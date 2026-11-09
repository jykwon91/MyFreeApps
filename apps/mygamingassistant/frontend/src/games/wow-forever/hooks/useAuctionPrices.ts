import { useGetWowPricesQuery } from "@/games/wow-forever/api/wowPricesApi";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { playerPriceFaction } from "@/games/wow-forever/prices/priceFaction";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

export type AuctionPricesStatus = "loading" | "error" | "ready";

export interface AuctionPricesState {
  status: AuctionPricesStatus;
  /** Whose auction houses these are (or will be, while loading). */
  faction: PriceFaction;
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
 * One faction's US auction-house prices — the player's own faction (the World
 * Map's saved faction) unless a page asks for another. Every caller of the same
 * faction shares one request and one cache. Nobody types anything: the server
 * keeps the prices up to date from Blizzard.
 */
export function useAuctionPrices(faction?: PriceFaction): AuctionPricesState {
  const [player] = usePlayerSettings();
  const wanted = faction ?? playerPriceFaction(player.faction);
  // `currentData`, not `data`: after a faction switch `data` still holds the old faction's prices.
  const { currentData: data, isError, isFetching, refetch } = useGetWowPricesQuery(wanted);
  const retry = () => void refetch();
  if (data) {
    return { status: "ready", faction: wanted, prices: mapOnce(data), retry, retrying: false };
  }
  if (isError) return { status: "error", faction: wanted, prices: null, retry, retrying: isFetching };
  return { status: "loading", faction: wanted, prices: null, retry, retrying: false };
}
