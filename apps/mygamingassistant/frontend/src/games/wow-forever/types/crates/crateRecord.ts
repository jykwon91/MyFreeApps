import type { CrateBundle } from "@/games/wow-forever/types/crates/crateBundle";
import type { CrateQuality } from "@/games/wow-forever/types/crates/crateQuality";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** One Waylaid Crate as the data file lists it. */
export interface CrateRecord {
  /** The crate item's id. */
  id: number;
  /** The full name, "Waylaid Crate: Journeyman Herbs". */
  name: string;
  tier: CrateTier;
  /** Blizzard's item quality; with the tier it fixes how many rewards the crate pays. */
  quality: CrateQuality;
  /** In game order. */
  bundles: CrateBundle[];
}
