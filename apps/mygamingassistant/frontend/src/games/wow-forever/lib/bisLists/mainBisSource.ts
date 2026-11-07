import type { WowClassId } from "@/games/wow-forever/data/classes";
import { questOpenTo } from "@/games/wow-forever/gear/gearFilters";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearSource } from "@/games/wow-forever/types/gearSource";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/**
 * The one source a list row names: the first the player can use (crafted are
 * listed first in the data), else the first at all; null when nothing is known.
 * The item page has the full list.
 */
export function mainBisSource(gear: GearData, itemId: number, classId: WowClassId, faction: PlayerFaction): GearSource | null {
  const all = gear.sources.get(itemId) ?? [];
  return all.find((s) => questOpenTo(s, classId, faction)) ?? all[0] ?? null;
}
