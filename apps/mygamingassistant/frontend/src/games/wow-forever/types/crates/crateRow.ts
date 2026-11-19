import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";
import type { CrateRecord } from "@/games/wow-forever/types/crates/crateRecord";

/** One grid row: a crate with its price (copper; null = unknown), every bundle priced, and the cheapest one. */
export interface CrateRow {
  crate: CrateRecord;
  cratePrice: number | null;
  bundles: CrateBundleRow[];
  /** Null when no bundle's material has a price. */
  cheapest: CrateBundleRow | null;
  /** The cheapest bundle's cost. */
  bundleCost: number | null;
  /** Crate + cheapest bundle, only when both are known, never a partial sum. */
  total: number | null;
  /** Rewards the crate pays (tier x quality). */
  reward: number;
  /** The total divided by the rewards, to the nearest copper; null when the total is unknown. */
  costPerReward: number | null;
}
