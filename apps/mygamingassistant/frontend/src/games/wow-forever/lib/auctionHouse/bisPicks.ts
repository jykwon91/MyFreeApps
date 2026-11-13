/** The top three items per equipment slot for one class at one level, as the Auction house filters by them. Pure. */
import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { BIS_RANKS } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import { canEquip, groupUsable } from "@/games/wow-forever/gear/gearFilters";
import { candidates, scorer, type Candidate } from "@/games/wow-forever/gear/rankGear";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

/** Best score first; ties go to the item you can get sooner, then the lower id. No penalty for an unknown source. */
function byScore(a: Candidate, b: Candidate): number {
  return b.score - a.score || (a.availableFrom ?? PRE_RAID_LEVEL) - (b.availableFrom ?? PRE_RAID_LEVEL) || a.item.id - b.item.id;
}

/** What can be bought and worn: not bind-on-pickup (never on the auction house) and, below the top level, with a known level. */
function buyable(pool: readonly Candidate[], level: number): Candidate[] {
  const leveling = level < PRE_RAID_LEVEL;
  return pool.filter((c) => !c.facts.bindOnPickup && (!leveling || (c.availableFrom !== null && c.availableFrom <= level)));
}

/**
 * Item id -> its rank and slot, for the top three of every slot card the class
 * can fill, scored the way the Best gear page scores them (Leveling weights
 * below level 60, the spec's level 60 weights at it). Rings and trinkets are one
 * pool each; two-hand and main hand / off hand stay separate cards, and an item
 * that tops two cards keeps its better rank. Bind-on-pickup items and ones with a
 * random suffix are left out.
 */
export function computeBisPicks(
  items: readonly ClientItem[],
  data: GearData,
  settings: GearSettings,
  level: number,
): ReadonlyMap<number, BisPick> {
  const leveling = level < PRE_RAID_LEVEL;
  const pool = buyable(candidates(items, data, settings, scorer(settings, leveling)), level);
  const picks = new Map<number, BisPick>();
  for (const group of GEAR_SLOT_GROUPS) {
    if (!groupUsable(group, settings.classId)) continue;
    const top = pool.filter((c) => canEquip(c.item, group, settings.classId, level)).sort(byScore).slice(0, BIS_RANKS.length);
    BIS_RANKS.forEach((rank, index) => {
      const pick = top[index];
      if (!pick) return;
      const held = picks.get(pick.item.id);
      if (!held || rank < held.rank) picks.set(pick.item.id, { rank, slot: group.label });
    });
  }
  return picks;
}
