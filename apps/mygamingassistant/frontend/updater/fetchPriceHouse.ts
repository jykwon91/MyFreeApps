import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICES_API_BASE } from "./pricesUpdaterConfig";

/** One house's prices from the live API (`GET /wow/prices`), the same response the site's download uses. */
export async function fetchPriceHouse(house: PriceHouse): Promise<PriceListResponse> {
  const url = `${PRICES_API_BASE}/wow/prices?server=${house.server}&faction=${house.faction}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as PriceListResponse;
  if (!Array.isArray(body.items) || !Array.isArray(body.columns)) {
    throw new Error(`GET ${url} returned no price table`);
  }
  return body;
}
