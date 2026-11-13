import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { LoadStatus } from "@/games/wow-forever/types/loadStatus";
import { useGetWowPricesQuery } from "@/games/wow-forever/api/wowPricesApi";
import { DEFAULT_PRICE_SERVER } from "@/games/wow-forever/data/priceServers";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import { playerPriceFaction } from "@/games/wow-forever/prices/priceFaction";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { PriceServer } from "@/games/wow-forever/types/priceServer";

export interface AuctionPricesState {
  status: LoadStatus;
  /** Whose auction house these are (or will be, while loading): a server's house for one faction. */
  server: PriceServer;
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
 * One US auction house's prices — the PvP server's house for the player's own
 * faction (the World Map's saved faction) unless a page asks for another.
 * Every caller of the same house shares one request and one cache. Nobody
 * types anything: the server keeps the prices up to date from Blizzard.
 */
export function useAuctionPrices(faction?: PriceFaction, server: PriceServer = DEFAULT_PRICE_SERVER): AuctionPricesState {
  const [player] = usePlayerSettings();
  const wanted = faction ?? playerPriceFaction(player.faction);
  // `currentData`, not `data`: after a house switch `data` still holds the old house's prices.
  const { currentData: data, isError, isFetching, refetch } = useGetWowPricesQuery({ server, faction: wanted });
  const retry = () => void refetch();
  const house = { server, faction: wanted };
  if (data) return { status: LOAD_STATUS.ready, ...house, prices: mapOnce(data), retry, retrying: false };
  if (isError) return { status: LOAD_STATUS.error, ...house, prices: null, retry, retrying: isFetching };
  return { status: LOAD_STATUS.loading, ...house, prices: null, retry, retrying: false };
}
