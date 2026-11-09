/**
 * The live data Ask's tools fetch: the same RTK Query endpoints (and cache) the
 * Auction house and Server status pages use, called outside React.
 */
import { wowPricesApi } from "@/games/wow-forever/api/wowPricesApi";
import { wowServerStatusApi } from "@/games/wow-forever/api/wowServerStatusApi";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";
import { store } from "@/lib/store";

export async function fetchAskPrices(faction: PriceFaction): Promise<PriceListResponse> {
  const request = store.dispatch(wowPricesApi.endpoints.getWowPrices.initiate(faction));
  try {
    return await request.unwrap();
  } finally {
    request.unsubscribe();
  }
}

export async function fetchAskServerStatus(region: WowRegion): Promise<ServerStatusResponse> {
  const request = store.dispatch(wowServerStatusApi.endpoints.getServerStatus.initiate(region));
  try {
    return await request.unwrap();
  } finally {
    request.unsubscribe();
  }
}
