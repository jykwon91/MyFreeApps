import { findClass, findSpec } from "@/games/wow-forever/data/classes";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

/**
 * "Best gear for a level 60 Affliction Warlock (Alliance)." — what the cards
 * below answer. Leveling scores one way per class, so its heading leaves the
 * spec out rather than claim the list is for it.
 */
export function gearHeading(settings: GearSettings, level: number, leveling: boolean): string {
  const cls = findClass(settings.classId)?.name ?? "";
  const spec = leveling ? undefined : findSpec(settings.classId, settings.specId)?.name;
  const who = spec ? `${spec} ${cls}` : cls;
  const side = PLAYER_FACTION_OPTIONS.find((o) => o.id === settings.faction)?.label ?? "";
  return `Best gear for a level ${level} ${who} (${side}).`;
}
