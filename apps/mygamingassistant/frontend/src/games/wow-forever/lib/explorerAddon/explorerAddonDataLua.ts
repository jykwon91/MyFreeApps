import { luaValue } from "@/games/wow-forever/lib/addons/luaValue";
import type { ExploreData } from "@/games/wow-forever/types/explore/exploreData";

/**
 * MGA Explorer's `Data.lua`: every zone and area Explore Azeroth counts, from `data/explore/explore.json` (the Forever
 * client's achievement criteria). An area is a row {criteria, overlay, name, x, y, textureX, textureY, left, top, right, bottom}; field names are read by `Core.lua`.
 */
export function explorerAddonDataLua(data: ExploreData): string {
  const lua = {
    achievement: data.achievement.id,
    name: data.achievement.name,
    continents: data.continents.map((c) => ({
      achievement: c.achievement,
      name: c.name,
      continent: c.continent,
      zones: c.zones.map((z) => ({
        achievement: z.achievement,
        name: z.name,
        map: z.map,
        areas: z.areas.map((a) => [a.criteria, a.overlay, a.name, a.x, a.y, a.texture?.[0], a.texture?.[1], ...a.rect]),
      })),
    })),
  };
  return [
    "-- Generated from the site's Explorer data (the Forever client's achievement criteria). Do not edit: run `npx vitest run src/__tests__/wowExplorerAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "-- An area is {criteria id, map overlay id, name, x, y, texture x, texture y, left, top, right, bottom}: x and y (where to go) and the rect the area covers",
    "-- are percent of zone map `map` (MGA Waypoints' own ids);",
    "-- the texture offset is the overlay today's zone art draws (nil when it draws none), matched against C_MapExplorationInfo.",
    `MGAExplorerData = ${luaValue(lua)}`,
    "",
  ].join("\n");
}
