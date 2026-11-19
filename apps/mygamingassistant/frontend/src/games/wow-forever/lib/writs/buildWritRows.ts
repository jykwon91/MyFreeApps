import { isWritDeal } from "@/games/wow-forever/lib/writs/isWritDeal";
import { summarizeTurnIn } from "@/games/wow-forever/lib/writs/writTurnInSummary";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritTurnIn } from "@/games/wow-forever/types/writs/writTurnIn";
import type { WritsFile } from "@/games/wow-forever/types/writs/writsFile";

/**
 * One row per writ. `priceOf` answers an item id's auction price in copper (undefined = no price).
 * The total is writ + item only when both are known, never a partial sum.
 */
export function buildWritRows(
  file: WritsFile,
  priceOf: (itemId: number) => number | undefined,
  faction: WritTurnIn["faction"] | null,
): WritRow[] {
  return file.writs.map((writ) => {
    const writPrice = priceOf(writ.id) ?? null;
    const itemPrice = writ.product ? (priceOf(writ.product.id) ?? null) : null;
    const total = writPrice !== null && itemPrice !== null ? writPrice + itemPrice : null;
    return {
      writ,
      writPrice,
      itemPrice,
      total,
      deal: isWritDeal(writ.tier, total),
      turnIn: summarizeTurnIn(file.turnIns[String(writ.questId)], faction),
    };
  });
}
