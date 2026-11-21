import journalArt from "@/games/wow-forever/data/dungeonQuestsAddon/journalArt.json";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { guideProfession } from "@/games/wow-forever/lib/character/characterProfessions";
import { professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { placeText } from "@/games/wow-forever/lib/dungeonQuestsAddon/placeText";
import { objectiveText } from "@/games/wow-forever/lib/dungeonQuestsAddon/objectiveText";
import { travelDataLua } from "@/games/wow-forever/lib/dungeonQuestsAddon/travelDataLua";
import { placedGiversByName, turnInGiver } from "@/games/wow-forever/lib/dungeonQuestsAddon/turnInGiver";
import { questsForFaction } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";
import type { QuestTurnIn } from "@/games/wow-forever/types/dungeons/questTurnIn";
import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

type AddonDungeon = Pick<
  Dungeon,
  "slug" | "instanceId" | "name" | "aliases" | "levelMin" | "levelMax" | "quests" | "bosses" | "maxPlayers" | "newInForever" | "entrances" | "foreverQuests"
>;

const DUNGEON_ART: Readonly<Record<string, { button: number; lore: number }>> = journalArt.dungeons;
const BOSS_PORTRAITS: Readonly<Record<string, number>> = journalArt.bosses;

/** Where the giver is, as the addon prints it; null when we don't know. */
function giverWhere(giver: QuestGiver): string | null {
  if (giver.insideDungeon) return "inside the dungeon";
  if (!giver.place) return null;
  const { zoneName, subzone, x, y } = giver.place;
  return placeText(zoneName, subzone, x, y);
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

/** Everyone who gives one of these quests, for working out who takes a quest back. */
function allGivers(dungeons: readonly AddonDungeon[]): QuestGiver[] {
  return dungeons.flatMap((dungeon) =>
    [FACTION.alliance, FACTION.horde].flatMap((faction) =>
      questLines(dungeon.quests, faction).flatMap((line) => line.steps.flatMap((step) => step.giver ?? [])),
    ),
  );
}

/** Where the quest goes back to, for the addon's Route button; nothing when we can't tell. */
function turnInSpotLua(enders: readonly string[], givers: ReadonlyMap<string, QuestGiver | null>): string {
  const giver = turnInGiver(enders, givers);
  if (!giver?.place) return "";
  const { zoneId, x, y } = giver.place;
  return `, turnInMap = ${zoneId}, turnInX = ${x.toFixed(1)}, turnInY = ${y.toFixed(1)}, turnInWhere = ${luaString(giverWhere(giver) ?? "")}`;
}

/** A quest's objectives and who takes it back, for the addon's "Next:" line. */
function turnInLua(quest: QuestTurnIn | undefined, givers: ReadonlyMap<string, QuestGiver | null>): string {
  if (!quest) return "";
  const objectives = quest.objectives.length > 0 ? `, objectives = {${quest.objectives.map((o) => luaString(objectiveText(o))).join(", ")}}` : "";
  const turnIn = quest.enders.length > 0 ? `, turnIn = ${luaString(quest.enders[0])}` : "";
  return objectives + turnIn + turnInSpotLua(quest.enders, givers);
}

function stepLua(s: QuestPickup, details: ReadonlyMap<number, QuestTurnIn>, givers: ReadonlyMap<string, QuestGiver | null>): string {
  return (
    `        {id = ${s.id}, title = ${luaString(s.title)}, level = ${s.level}, minLevel = ${s.minLevel}` +
    `${s.dungeonQuest ? ", dungeon = true" : ""}${giverLua(s.giver)}${turnInLua(details.get(s.id), givers)}},`
  );
}

/**
 * A quest of a dungeon Forever added, as its own one-step line done in the dungeon. Blizzard's API gives no
 * level or giver, so the level is only there once the game has shown it to us; objectives and who takes it
 * back come from the quest's detail when we have one.
 */
function foreverLineLua(
  q: ForeverDungeonQuest,
  details: ReadonlyMap<number, QuestTurnIn>,
  givers: ReadonlyMap<string, QuestGiver | null>,
): string[] {
  const classes = q.classes.length > 0 ? `, classes = {${q.classes.map(luaString).join(", ")}}` : "";
  const level = q.seen ? `, level = ${q.seen.level}, minLevel = ${q.seen.minLevel}` : "";
  return [
    `      {titles = {${luaString(q.title)}}${classes}, steps = {`,
    `        {id = ${q.id}, title = ${luaString(q.title)}${level}, dungeon = true${turnInLua(details.get(q.id), givers)}},`,
    "      }},",
  ];
}

// A name the game won't give would hide the line from everyone with the profession: refuse it.
function skillName(skillLine: number): string {
  if (guideProfession(skillLine) === null) throw new Error(`Data.lua: no profession name for SkillLine ${skillLine}`);
  return professionName(skillLine);
}

function lineLua(line: QuestLine, details: ReadonlyMap<number, QuestTurnIn>, givers: ReadonlyMap<string, QuestGiver | null>): string[] {
  const classes = line.classes.length > 0 ? `, classes = {${line.classes.map(luaString).join(", ")}}` : "";
  // The profession by its enUS name: what GetSkillLineInfo gives in game.
  const skill = line.skill ? `, skill = {name = ${luaString(skillName(line.skill.skillLine))}, level = ${line.skill.level}}` : "";
  return [
    `      {titles = {${line.titles.map(luaString).join(", ")}}${classes}${skill}, steps = {`,
    ...line.steps.map((s) => stepLua(s, details, givers)),
    "      }},",
  ];
}

function factionLua(
  dungeon: AddonDungeon,
  faction: PlayerFaction,
  details: ReadonlyMap<number, QuestTurnIn>,
  givers: ReadonlyMap<string, QuestGiver | null>,
): string[] {
  const lines = questLines(dungeon.quests, faction);
  const forever = questsForFaction(dungeon.foreverQuests, faction).filter((q) => !q.repeatable);
  if (lines.length === 0 && forever.length === 0) return [];
  // A dungeon quest's own page data (seen in game when it has been) beats the quest shard's.
  const all = new Map([...details, ...dungeon.quests.map((q) => [q.id, q] as const)]);
  const key = faction === FACTION.alliance ? "alliance" : "horde"; // what UnitFactionGroup gives, lowercased
  return [
    `    ${key} = {`,
    ...lines.flatMap((line) => lineLua(line, all, givers)),
    ...forever.flatMap((q) => foreverLineLua(q, details, givers)),
    "    },",
  ];
}

function lootLua(item: BossLootItem): string {
  const slot = item.slot ? `, slot = ${luaString(SLOT_LABELS[item.slot])}` : "";
  const kind = item.itemType ? `, kind = ${luaString(item.itemType)}` : "";
  return `{id = ${item.id}, name = ${luaString(item.name)}${slot}${kind}, chance = ${item.chance}}`;
}

function bossLua(boss: DungeonBoss): string[] {
  const portrait = BOSS_PORTRAITS[boss.name];
  const head = `      {name = ${luaString(boss.name)}${portrait ? `, portrait = ${portrait}` : ""}`;
  if (!boss.loot || boss.loot.length === 0) return [`${head}},`];
  return [`${head}, loot = {`, ...boss.loot.map((item) => `        ${lootLua(item)},`), "      }},"];
}

/** The dungeon's first door we know of, for the Overview tab's route; nothing when only its area is known. */
function doorLua(dungeon: AddonDungeon): string {
  const zone = dungeon.entrances.find((entrance) => entrance.doors.length > 0);
  if (!zone) return "";
  const { x, y } = zone.doors[0];
  const where = `${zone.zoneName} ${x.toFixed(1)}, ${y.toFixed(1)}`;
  return `door = {map = ${zone.zoneId}, x = ${x.toFixed(1)}, y = ${y.toFixed(1)}, where = ${luaString(where)}},`;
}

/** What the journal shows beyond the quests: group size, its door, its art (the client's file ids) and bosses. */
function journalLua(dungeon: AddonDungeon): string[] {
  const art = DUNGEON_ART[dungeon.slug];
  const facts = [
    dungeon.maxPlayers ? `players = ${dungeon.maxPlayers},` : "",
    dungeon.newInForever ? "isNew = true," : "",
    art ? `art = {button = ${art.button}, lore = ${art.lore}},` : "",
    doorLua(dungeon),
  ].filter(Boolean);
  return [...(facts.length > 0 ? [`    ${facts.join(" ")}`] : []), "    bosses = {", ...dungeon.bosses.flatMap(bossLua), "    },"];
}

function dungeonLua(dungeon: AddonDungeon, details: ReadonlyMap<number, QuestTurnIn>, givers: ReadonlyMap<string, QuestGiver | null>): string[] {
  const alliance = factionLua(dungeon, FACTION.alliance, details, givers);
  const horde = factionLua(dungeon, FACTION.horde, details, givers);
  return [
    "  {",
    `    key = ${luaString(dungeon.slug)}, instanceId = ${dungeon.instanceId}, name = ${luaString(dungeon.name)},` +
      ` levelMin = ${dungeon.levelMin}, levelMax = ${dungeon.levelMax},` +
      (dungeon.aliases.length > 0 ? ` aliases = {${dungeon.aliases.map(luaString).join(", ")}},` : ""),
    ...journalLua(dungeon),
    ...alliance,
    ...horde,
    "  },",
  ];
}

/**
 * MGA Dungeon Quests' `Data.lua`: per dungeon (lowest level first), its bosses and their loot, and each faction's quest lines — the
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
  const givers = placedGiversByName(allGivers(sorted));
  return [
    "-- Generated from MyGamingAssistant's dungeon pages (\"Before you go\").",
    "-- Do not edit: run `npx vitest run src/__tests__/wowDungeonQuestsAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGADungeonQuestsData = {",
    ...sorted.flatMap((d) => dungeonLua(d, details, givers)),
    "}",
    ...travelDataLua(),
    "",
  ].join("\n");
}
