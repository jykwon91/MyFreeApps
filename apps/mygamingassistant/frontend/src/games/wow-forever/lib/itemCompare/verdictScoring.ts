import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { scorer } from "@/games/wow-forever/gear/rankGear";
import { bisTarget } from "@/games/wow-forever/lib/auctionHouse/bisTarget";
import type { VerdictScoring } from "@/games/wow-forever/types/itemCompare/verdictScoring";

/**
 * Score items the way the Best gear page and the Auction house's best-gear badges do: the class's
 * leveling weights below level 60, the spec's level 60 weights at it. Pure.
 */
export function verdictScoring(classId: WowClassId, specId: string, level: number, clientBuild: string): VerdictScoring {
  const leveling = level < PRE_RAID_LEVEL;
  const score = scorer({ classId, specId }, leveling);
  return { score: (item) => score(item, clientBuild), label: bisTarget(level, classId, specId).label, leveling };
}
