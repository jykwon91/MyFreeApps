/**
 * What a recipe's materials cost at auction prices, and whether making it beats
 * buying it. Pure. A material without an auction price (most vendor goods) is
 * listed as missing, never counted as free.
 */
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { MakeOrBuy } from "@/games/wow-forever/types/makeOrBuy";
import type { MaterialsCost } from "@/games/wow-forever/types/materialsCost";

export function materialsCost(
  reagents: readonly { id: number; name: string; count: number }[],
  prices: AuctionPrices,
): MaterialsCost {
  let total = 0;
  const missing: string[] = [];
  for (const reagent of reagents) {
    const each = auctionCopper(prices, reagent.id);
    if (each === undefined) missing.push(reagent.name);
    else total += each * reagent.count;
  }
  return { total, missing, materials: reagents.length };
}

/**
 * Cheaper to make or to buy, for one craft that makes `made` of them. Only when
 * every material is priced and so is the item; otherwise there's no honest answer.
 */
export function cheaperWay(cost: MaterialsCost, buyEach: number | undefined, made = 1): MakeOrBuy | null {
  if (buyEach === undefined || cost.missing.length > 0) return null;
  const buy = buyEach * made;
  if (cost.total === buy) return null;
  return cost.total < buy ? "make" : "buy";
}

/** Copper between making one craft and buying what it makes. */
export function makeOrBuyGap(cost: MaterialsCost, buyEach: number, made = 1): number {
  return Math.abs(buyEach * made - cost.total);
}
