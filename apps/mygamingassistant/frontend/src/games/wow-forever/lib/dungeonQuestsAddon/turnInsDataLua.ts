import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { placeText } from "@/games/wow-forever/lib/dungeonQuestsAddon/placeText";
import type { TurnInSpot } from "@/games/wow-forever/types/dungeons/turnInSpot";

/**
 * MGA Dungeon Quests' `TurnIns.lua`: quest id -> {who takes it back, map, x, y, where}, for the World
 * Map pins on your finished quests and the turn-in route. `addon/MGADungeonQuests/TurnIns.lua` is this
 * text, kept in step by a file snapshot test (`npx vitest run -u` rewrites it).
 */
export function turnInsDataLua(spots: ReadonlyMap<number, TurnInSpot>): string {
  const rows = [...spots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, s]) =>
      `  [${id}] = {${luaString(s.name)}, ${s.zoneId}, ${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${luaString(placeText(s.zoneName, s.subzone, s.x, s.y))}},`,
    );
  return [
    "-- Generated from MyGamingAssistant's quest pages: who takes each quest back, and where.",
    "-- Do not edit: run `npx vitest run src/__tests__/wowDungeonQuestsTurnIns.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGADungeonQuestsTurnIns = {",
    ...rows,
    "}",
    "",
  ].join("\n");
}
