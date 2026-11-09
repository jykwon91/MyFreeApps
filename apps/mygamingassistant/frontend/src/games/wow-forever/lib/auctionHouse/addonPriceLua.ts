import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

function epochSeconds(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * The MGA Prices addon's `Data.lua`: each house's prices as
 * `items[itemId] = { market value, cheapest, on sale }` in copper, with when
 * Blizzard listed them. The top-level `updated` is the oldest house's, so the
 * addon's "download again" warning never understates how old a price is.
 */
export function addonPriceLua(houses: readonly PriceListResponse[]): string {
  const out = [
    "-- MGA Prices data, from the MyGamingAssistant Auction house page (US).",
    "-- Download the addon again there to refresh these prices.",
    "MGAPricesData = {",
  ];
  const stamps: number[] = [];
  const houseLines: string[] = [];
  for (const response of houses) {
    const prices = mapPriceList(response);
    const updated = epochSeconds(prices.sourceUpdatedAt);
    if (updated !== null) stamps.push(updated);
    houseLines.push(`    ${prices.faction} = {`);
    if (updated !== null) houseLines.push(`      updated = ${updated},`);
    houseLines.push("      items = {");
    for (const p of prices.byId.values()) houseLines.push(`        [${p.itemId}] = {${p.marketValue}, ${p.minBuyout}, ${p.quantity}},`);
    houseLines.push("      },", "    },");
  }
  if (stamps.length > 0) out.push(`  updated = ${Math.min(...stamps)},`);
  out.push("  houses = {", ...houseLines, "  },", "}", "");
  return out.join("\n");
}
