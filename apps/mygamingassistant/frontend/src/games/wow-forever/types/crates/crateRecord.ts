import type { CrateBundle } from "@/games/wow-forever/types/crates/crateBundle";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** One Waylaid Crate as the data file lists it. */
export interface CrateRecord {
  /** The crate item's id. */
  id: number;
  /** The full name, "Waylaid Crate: Journeyman Herbs". */
  name: string;
  tier: CrateTier;
  /** In game order. */
  bundles: CrateBundle[];
}
