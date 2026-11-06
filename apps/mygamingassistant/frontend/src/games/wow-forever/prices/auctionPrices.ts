/**
 * The prices API's columnar rows → lookups by item id and by name.
 *
 * Every page prices with `marketValue`. On TSM's Forever files it is never 0,
 * while the average sale price is missing for most items and jumps around on
 * thin markets. An item the source doesn't price has no entry, so it reads as
 * "no auction price" and is never treated as free.
 */
import type { EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

type Cell = string | number | null;

function intCell(row: readonly Cell[], index: number): number | null {
  const v = index < 0 ? null : row[index];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function numberCell(row: readonly Cell[], index: number): number | null {
  const v = index < 0 ? null : row[index];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Read the rows by their column names, so the server can add a column without breaking this. */
export function mapPriceList(response: PriceListResponse): AuctionPrices {
  const col = (name: string) => response.columns.indexOf(name);
  const idAt = col("item_id");
  const valueAt = col("market_value");
  const avgAt = col("avg_sale_price");
  const soldAt = col("sold_per_day");
  const nameAt = col("name");
  const byId = new Map<number, AuctionPrice>();
  const byName = new Map<string, AuctionPrice>();
  for (const row of response.items) {
    const itemId = intCell(row, idAt);
    const marketValue = intCell(row, valueAt);
    if (!itemId || marketValue === null) continue;
    const rawName = nameAt < 0 ? null : row[nameAt];
    const price: AuctionPrice = {
      itemId,
      name: typeof rawName === "string" ? rawName : "",
      marketValue,
      avgSalePrice: intCell(row, avgAt),
      soldPerDay: numberCell(row, soldAt),
    };
    byId.set(itemId, price);
    if (price.name && !byName.has(nameKey(price.name))) byName.set(nameKey(price.name), price);
  }
  return {
    region: response.region,
    credit: response.credit,
    sourceUpdatedAt: response.source_updated_at,
    byId,
    byName,
  };
}

/** Copper for one of the item, or undefined when there's no auction price. */
export function auctionCopper(prices: AuctionPrices | null, itemId: number): number | undefined {
  return prices?.byId.get(itemId)?.marketValue;
}

export function auctionCopperByName(prices: AuctionPrices | null, name: string): number | undefined {
  return prices?.byName.get(nameKey(name))?.marketValue;
}

/**
 * Item id → copper, the shape the crafting price book reads. It holds every
 * auction price, with what you typed winning over the auction price for that item.
 */
export function effectivePrices(prices: AuctionPrices | null, overrides: EnteredPrices): EnteredPrices {
  const out: Record<string, number> = {};
  if (prices) for (const [id, p] of prices.byId) out[String(id)] = p.marketValue;
  return { ...out, ...overrides };
}
