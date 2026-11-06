import type { GearSlotGroup } from "@/games/wow-forever/types/gearSlotGroup";
import type { RankedGearItem } from "@/games/wow-forever/types/rankedGearItem";

/** One slot card: its top items, and what the page says around them. */
export interface GearSlotResult {
  group: GearSlotGroup;
  top: readonly RankedGearItem[];
  /** Leveling only: the first better item you can get at a higher level. */
  nextUpgrade: RankedGearItem | null;
  /** Level 60 only: epics with no known source — may be raid loot, shown apart. */
  unknownEpics: readonly RankedGearItem[];
}
