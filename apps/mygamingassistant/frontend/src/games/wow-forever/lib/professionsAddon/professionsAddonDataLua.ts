import { luaValue } from "@/games/wow-forever/lib/professionsAddon/luaValue";
import type { AddonProfession } from "@/games/wow-forever/types/professionsAddon/addonProfession";

/**
 * MGA Professions' `Data.lua`: every profession's route, ranks, trainers, and (for gatherers) the nodes or beasts it ranks zones from.
 * All of it is the Professions page's own data, never typed in by hand. Field names are read by `Core.lua`.
 */
export function professionsAddonDataLua(professions: readonly AddonProfession[]): string {
  const data = {
    order: professions.map((p) => p.key),
    professions: Object.fromEntries(professions.map((p) => [p.key, p])),
  };
  return [
    "-- Generated from the site's Professions data. Do not edit: run `npx vitest run src/__tests__/wowProfessionsAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "-- Steps: kind = craft | options | text | milestone. Places are {name, map, x, y, where}: x and y are percent of zone map `map` (MGA Waypoints' own ids).",
    "-- `confirmed = false` is a Classic fact not yet checked in Forever. Skills, levels and trainers are Classic data.",
    `MGAProfessionsData = ${luaValue(data)}`,
    "",
  ].join("\n");
}
