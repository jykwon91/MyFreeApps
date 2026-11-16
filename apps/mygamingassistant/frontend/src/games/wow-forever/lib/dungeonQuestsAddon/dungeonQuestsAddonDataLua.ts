import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

type AddonDungeon = Pick<Dungeon, "slug" | "instanceId" | "name" | "aliases" | "levelMin" | "levelMax" | "quests">;

/** Where the giver is, as the addon prints it; null when we don't know. */
function giverWhere(giver: QuestGiver): string | null {
  if (giver.insideDungeon) return "inside the dungeon";
  if (!giver.place) return null;
  const { zoneName, subzone, x, y } = giver.place;
  const spot = `${zoneName} ${x.toFixed(1)}, ${y.toFixed(1)}`;
  return subzone && subzone !== zoneName ? `${spot} (${subzone})` : spot;
}

function giverLua(giver: QuestGiver | null): string {
  if (!giver) return "";
  const where = giverWhere(giver);
  const fromItem = giver.kind === QUEST_TARGET_KIND.item ? ", item = true" : "";
  return `, giver = ${luaString(giver.name)}${fromItem}${where ? `, where = ${luaString(where)}` : ""}`;
}

function lineLua(line: QuestLine): string[] {
  const classes = line.classes.length > 0 ? `, classes = {${line.classes.map(luaString).join(", ")}}` : "";
  return [
    `      {titles = {${line.titles.map(luaString).join(", ")}}${classes}, steps = {`,
    ...line.steps.map(
      (s) =>
        `        {id = ${s.id}, title = ${luaString(s.title)}, level = ${s.level}, minLevel = ${s.minLevel}` +
        `${s.dungeonQuest ? ", dungeon = true" : ""}${giverLua(s.giver)}},`,
    ),
    "      }},",
  ];
}

function factionLua(dungeon: AddonDungeon, faction: PlayerFaction): string[] {
  const lines = questLines(dungeon.quests, faction);
  if (lines.length === 0) return [];
  const key = faction === FACTION.alliance ? "alliance" : "horde"; // what UnitFactionGroup gives, lowercased
  return [`    ${key} = {`, ...lines.flatMap(lineLua), "    },"];
}

function dungeonLua(dungeon: AddonDungeon): string[] {
  const alliance = factionLua(dungeon, FACTION.alliance);
  const horde = factionLua(dungeon, FACTION.horde);
  if (alliance.length === 0 && horde.length === 0) return [];
  return [
    "  {",
    `    key = ${luaString(dungeon.slug)}, instanceId = ${dungeon.instanceId}, name = ${luaString(dungeon.name)},` +
      ` levelMin = ${dungeon.levelMin}, levelMax = ${dungeon.levelMax},` +
      (dungeon.aliases.length > 0 ? ` aliases = {${dungeon.aliases.map(luaString).join(", ")}},` : ""),
    ...alliance,
    ...horde,
    "  },",
  ];
}

/**
 * MGA Dungeon Quests' `Data.lua`: per dungeon (lowest level first), each faction's quest lines — the
 * quests before each dungeon quest, then the dungeon quest — with who gives each and where. The same
 * lines the dungeon page's "Before you go" builds (`questLines`). `addon/MGADungeonQuests/Data.lua` is
 * this text, kept in step by a file snapshot test (`npx vitest run -u` rewrites it).
 */
export function dungeonQuestsAddonDataLua(dungeons: readonly AddonDungeon[]): string {
  const sorted = [...dungeons].sort((a, b) => a.levelMin - b.levelMin || a.name.localeCompare(b.name));
  return [
    "-- Generated from MyGamingAssistant's dungeon pages (\"Before you go\").",
    "-- Do not edit: run `npx vitest run src/__tests__/wowDungeonQuestsAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGADungeonQuestsData = {",
    ...sorted.flatMap(dungeonLua),
    "}",
    "",
  ].join("\n");
}
