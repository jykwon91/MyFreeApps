import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { cheaperWay, makeOrBuyGap } from "@/games/wow-forever/prices/materialsCost";
import type { MaterialsCost } from "@/games/wow-forever/types/materialsCost";

/** "Materials for one craft", and how many it makes when that's more than one. */
export function materialsLabel(made: number): string {
  return made > 1 ? `Materials for one craft (makes ${made})` : "Materials for one craft";
}

/** "Cheaper to craft: saves ~3g per craft." / "Cheaper to buy: ~1g less than the materials." Null with no honest answer. */
export function craftedVerdict(cost: MaterialsCost, buyEach: number | undefined, made: number): string | null {
  const way = cheaperWay(cost, buyEach, made);
  if (way === null || buyEach === undefined) return null;
  const gap = formatCost(makeOrBuyGap(cost, buyEach, made));
  return way === "make" ? `Cheaper to craft: saves ${gap} per craft.` : `Cheaper to buy: ${gap} less than the materials.`;
}
