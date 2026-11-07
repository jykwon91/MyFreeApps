import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_VIEW } from "@/games/wow-forever/data/gear/gearViews";
import { BIS_LIST_PHASE } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { rankLeveling, rankPreRaid } from "@/games/wow-forever/gear/rankGear";
import { startingBisItems } from "@/games/wow-forever/lib/bisLists/startingBisItems";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";
import type { RecommendedFor } from "@/games/wow-forever/types/bisLists/recommendedFor";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

/**
 * The Best gear picks a new list starts from: the leveling table at the
 * chosen level for a Leveling list, else the level-60 pre-raid table (raids
 * aren't ranked, so a Raid list starts from pre-raid too). PvP gear is left out.
 */
export function recommendedBisItems(items: readonly ClientItem[], gear: GearData, target: RecommendedFor): BisListItems {
  const leveling = target.phase === BIS_LIST_PHASE.leveling;
  const settings: GearSettings = {
    classId: target.classId,
    specId: target.specId,
    level: leveling ? target.level : PRE_RAID_LEVEL,
    faction: target.faction,
    view: leveling ? GEAR_VIEW.leveling : GEAR_VIEW.preraid,
    includePvp: false,
  };
  const ranking = leveling ? rankLeveling(items, gear, settings, target.level) : rankPreRaid(items, gear, settings);
  return startingBisItems(ranking);
}
