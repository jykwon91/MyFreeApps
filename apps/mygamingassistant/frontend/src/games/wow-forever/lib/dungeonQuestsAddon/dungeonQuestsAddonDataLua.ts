import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { objectiveText } from "@/games/wow-forever/lib/dungeonQuestsAddon/objectiveText";
import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";
import type { QuestTurnIn } from "@/games/wow-forever/types/dungeons/questTurnIn";
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

/** The giver's map pin: the World Map zone (uiMapId) and map percent; none inside a dungeon or when we don't know where. */
function pinLua(giver: QuestGiver): string {
  if (giver.insideDungeon || !giver.place) return "";
  const { zoneId, x, y } = giver.place;
  return `, map = ${zoneId}, x = ${x.toFixed(1)}, y = ${y.toFixed(1)}`;
}

function giverLua(giver: QuestGiver | null): string {
  if (!giver) return "";
  const where = giverWhere(giver);
  const fromItem = giver.kind === QUEST_TARGET_KIND.item ? ", item = true" : "";
  return `, giver = ${luaString(giver.name)}${fromItem}${where ? `, where = ${luaString(where)}` : ""}${pinLua(giver)}`;
}

/** A quest's objectives and who takes it back, for the addon's "Next:" line. */
function turnInLua(quest: QuestTurnIn | undefined): string {
  if (!quest) return "";
  const objectives = quest.objectives.length > 0 ? `, objectives = {${quest.objectives.map((o) => luaString(objectiveText(o))).join(", ")}}` : "";
  const turnIn = quest.enders.length > 0 ? `, turnIn = ${luaString(quest.enders[0])}` : "";
  return objectives + turnIn;
}

function stepLua(s: QuestPickup, details: ReadonlyMap<number, QuestTurnIn>): string {
  return (
    `        {id = ${s.id}, title = ${luaString(s.title)}, level = ${s.level}, minLevel = ${s.minLevel}` +
    `${s.dungeonQuest ? ", dungeon = true" : ""}${giverLua(s.giver)}${turnInLua(details.get(s.id))}},`
  );
}

function lineLua(line: QuestLine, details: ReadonlyMap<number, QuestTurnIn>): string[] {
  const classes = line.classes.length > 0 ? `, classes = {${line.classes.map(luaString).join(", ")}}` : "";
  return [
    `      {titles = {${line.titles.map(luaString).join(", ")}}${classes}, steps = {`,
    ...line.steps.map((s) => stepLua(s, details)),
    "      }},",
  ];
}

function factionLua(dungeon: AddonDungeon, faction: PlayerFaction, details: ReadonlyMap<number, QuestTurnIn>): string[] {
  const lines = questLines(dungeon.quests, faction);
  if (lines.length === 0) return [];
  // A dungeon quest's own page data (seen in game when it has been) beats the quest shard's.
  const all = new Map([...details, ...dungeon.quests.map((q) => [q.id, q] as const)]);
  const key = faction === FACTION.alliance ? "alliance" : "horde"; // what UnitFactionGroup gives, lowercased
  return [`    ${key} = {`, ...lines.flatMap((line) => lineLua(line, all)), "    },"];
}

function dungeonLua(dungeon: AddonDungeon, details: ReadonlyMap<number, QuestTurnIn>): string[] {
  const alliance = factionLua(dungeon, FACTION.alliance, details);
  const horde = factionLua(dungeon, FACTION.horde, details);
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
 * quests before each dungeon quest, then the dungeon quest — with who gives each, where and its map pin,
 * and its objectives and who takes it back (`details`: `loadDungeonQuestsAddonDetails`). The same
 * lines the dungeon page's "Before you go" builds (`questLines`). `addon/MGADungeonQuests/Data.lua` is
 * this text, kept in step by a file snapshot test (`npx vitest run -u` rewrites it).
 */
export function dungeonQuestsAddonDataLua(
  dungeons: readonly AddonDungeon[],
  details: ReadonlyMap<number, QuestTurnIn>,
): string {
  const sorted = [...dungeons].sort((a, b) => a.levelMin - b.levelMin || a.name.localeCompare(b.name));
  return [
    "-- Generated from MyGamingAssistant's dungeon pages (\"Before you go\").",
    "-- Do not edit: run `npx vitest run src/__tests__/wowDungeonQuestsAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGADungeonQuestsData = {",
    ...sorted.flatMap((d) => dungeonLua(d, details)),
    "}",
    "",
  ].join("\n");
}
