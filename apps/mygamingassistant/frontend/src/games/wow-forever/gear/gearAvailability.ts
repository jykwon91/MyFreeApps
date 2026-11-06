import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

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
 * The level you can first get and wear an item at, or null when nothing says.
 *
 * - The item's own required level, raised to its earliest source's level
 *   (a quest's min level, a dungeon's entry level, the level a crafter can
 *   train the recipe's rank at — a crafted item can be bought from one).
 * - No required level (many Classic quest rewards): the earliest source's level.
 * - Neither: null — the page leaves it out of the leveling list.
 * Sources that don't say a level never pull it down.
 */
export function availableFrom(item: ClientItem, sources: readonly GearSource[]): number | null {
  const known = sources.map(sourceLevel).filter((level): level is number => level !== null);
  const earliest = known.length > 0 ? Math.min(...known) : null;
  if (item.requiredLevel > 0) return Math.max(item.requiredLevel, earliest ?? 0);
  return earliest;
}
