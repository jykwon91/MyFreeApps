/**
 * What a food costs at auction prices: the ingredients for one cook, the food
 * itself, and which of the two is cheaper. Pure. An ingredient without an
 * auction price (most vendor spices) is listed as missing, never counted as free.
 */
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { FoodRecord, FoodReagent } from "@/games/wow-forever/types/food";

export interface CookCost {
  /** Copper for the ingredients that have a price. */
  total: number;
  /** Ingredients with no auction price, left out of `total`. */
  missing: FoodReagent[];
}

export function cookCost(food: Pick<FoodRecord, "reagents">, prices: AuctionPrices): CookCost {
  let total = 0;
  const missing: FoodReagent[] = [];
  for (const reagent of food.reagents) {
    const each = auctionCopper(prices, reagent.id);
    if (each === undefined) missing.push(reagent);
    else total += each * reagent.count;
  }
  return { total, missing };
}

export type FoodDeal = "cook" | "buy";

/**
 * Cheaper to cook or to buy. Only when the ingredients are fully priced and
 * the food is too; otherwise there's no honest answer.
 */
export function cheaperWay(cook: CookCost, buy: number | undefined): FoodDeal | null {
  if (buy === undefined || cook.missing.length > 0 || cook.total === buy) return null;
  return cook.total < buy ? "cook" : "buy";
}
