import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

/**
 * Evidence: for 2194 items in items.json with itemLevel 30–70 and
 * requiredLevel > 1, the gap (itemLevel − requiredLevel) is almost always
 * exactly 5 for all three qualities (uncommon, rare, epic): median = 5,
 * p10 = p25 = p75 = p90 = 5. Used to estimate the obtainable level for
 * items whose client requiredLevel is 0 or 1 but have no known source —
 * most likely quest or dungeon rewards with a missing or defaulted entry.
 */
const ILVL_TO_REQ_LEVEL_GAP = 5;

/**
 * The level a crafter can first make a recipe at: the rank (Journeyman,
 * Expert, Artisan) whose skill cap covers it. Null for Apprentice recipes and
 * professions without rank data: nothing says what level those need.
 */
export function craftLevel(profession: string, skill: number): number | null {
  const key = profession.toLowerCase();
  if (!isCraftingProfession(key)) return null;
  return CRAFTING_RANKS[key].find((rank) => rank.cap >= skill && rank.skill < skill)?.level ?? null;
}

/** The level a source opens at, or null when it doesn't say (a drop outside the dungeon list). */
function sourceLevel(source: GearSource): number | null {
  if (source.kind === "quest") return source.minLevel;
  if (source.kind === "drop") return source.dungeon?.enterAt ?? null;
  return craftLevel(source.profession, source.skill);
}

/**
 * Returns true when the item's availability level is estimated from its item
 * level rather than stated in the data. This happens when requiredLevel is 0
 * or 1 and the item has no known source at all — the client entry is likely
 * missing or defaulted. The UI shows "probably from about level N" for these.
 */
export function isAvailabilityEstimated(item: ClientItem, sources: readonly GearSource[]): boolean {
  return item.requiredLevel <= 1 && sources.length === 0;
}

/**
 * The level you can first get and wear an item at, or null when nothing says.
 *
 * - The item's own required level, raised to its earliest source's level
 *   (a quest's min level, a dungeon's entry level, the level a crafter can
 *   train the recipe's rank at — a crafted item can be bought from one).
 * - No required level with known source level: the source's level.
 * - requiredLevel ≤ 1 with no sources at all: estimated as itemLevel − 5
 *   (see ILVL_TO_REQ_LEVEL_GAP). The estimate keeps leveling picks accurate —
 *   a cloth circlet with ilvl 43 is obtainable around level 38, not level 1.
 * - requiredLevel ≤ 1 with sources but none giving a level: null — the item
 *   may genuinely be obtainable from level 1 (Apprentice craft, unlisted drop).
 * Sources that don't say a level never pull the result down.
 */
export function availableFrom(item: ClientItem, sources: readonly GearSource[]): number | null {
  const known = sources.map(sourceLevel).filter((level): level is number => level !== null);
  const earliest = known.length > 0 ? Math.min(...known) : null;
  if (item.requiredLevel > 1) return Math.max(item.requiredLevel, earliest ?? 0);
  if (earliest !== null) return Math.max(item.requiredLevel, earliest);
  // requiredLevel ≤ 1 with no source-based level
  if (sources.length > 0) return null; // sources exist but can't say a level — may be level 1
  return Math.max(1, item.itemLevel - ILVL_TO_REQ_LEVEL_GAP); // estimated
}
