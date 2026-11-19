import { CRATE_REWARDS } from "@/games/wow-forever/data/professions/crates/crateRewards";
import type { CrateRecord } from "@/games/wow-forever/types/crates/crateRecord";

/** How many rewards the crate pays. */
export function crateReward(crate: Pick<CrateRecord, "tier" | "quality">): number {
  return CRATE_REWARDS[crate.tier][crate.quality];
}

/** What one reward costs, in copper rounded to the nearest copper; null when the total is unknown. */
export function costPerReward(total: number | null, reward: number): number | null {
  return total === null ? null : Math.round(total / reward);
}
