import { WRIT_DEAL_THRESHOLD } from "@/games/wow-forever/data/professions/writs/writDealThresholds";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** A deal is a known total strictly under the tier's threshold; an unknown total never is. */
export function isWritDeal(tier: WritTier, total: number | null): boolean {
  return total !== null && total < WRIT_DEAL_THRESHOLD[tier];
}
