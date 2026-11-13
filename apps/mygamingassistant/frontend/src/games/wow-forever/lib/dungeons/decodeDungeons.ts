/**
 * The dungeon pages' data, built from files other pages already ship: the
 * World Map's entrances (`classicDungeons.json` — Forever levels, Classic
 * doors), Forever's own dungeons (`foreverDungeons.json` — the client's level,
 * bosses and area, nothing else), interiors (`classicInteriors.json` — the Forever client's bosses in
 * order, Classic locked doors), zones and flight masters (decoded by the World
 * Map, `DungeonWorld`), plus the dungeon generator's boss loot
 * (`dungeons/classic/bossLoot.json`, Classic chances), item names
 * (`dungeons/lootItems.json`), group sizes (`dungeons/dungeonFacts.json`, the
 * Forever client), entry requirements (`dungeons/classic/entryRequirements.json`)
 * and quests (`decodeDungeonQuests`; Forever's own dungeons' from Blizzard's
 * Game Data API, `decodeForeverDungeonQuests`).
 */
import { isItemSlot } from "@/games/wow-forever/data/itemSlots";
import { INSTANCE_ALIASES } from "@/games/wow-forever/data/worldMap/placeNames";
import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import { decodeDungeonQuests } from "@/games/wow-forever/lib/dungeons/decodeDungeonQuests";
import { decodeForeverDungeonQuests } from "@/games/wow-forever/lib/dungeons/decodeForeverDungeonQuests";
import { uniqueSlugs, dungeonSlug } from "@/games/wow-forever/lib/dungeons/dungeonSlug";
import { nearestFlightPaths } from "@/games/wow-forever/lib/dungeons/nearestFlightPaths";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonDoor } from "@/games/wow-forever/types/dungeons/dungeonDoor";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";
import type { DungeonEntryRequirement } from "@/games/wow-forever/types/dungeons/dungeonEntryRequirement";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import type { DungeonWorld } from "@/games/wow-forever/types/dungeons/dungeonWorld";
import type { LootItemInfo } from "@/games/wow-forever/types/dungeons/lootItemInfo";
import type { FlightNode, WorldZone } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { decodeInteriors, type Interior } from "@/games/wow-forever/worldMap/interiors";

const DUNGEON_TYPE = "dungeon";

/** A Classic dungeon before its bosses and the rest are joined: its door always gives a level. */
type DungeonBase = Omit<
  Dungeon,
  "bosses" | "interior" | "maxPlayers" | "entryRequirements" | "lockedDoorKeys" | "quests" | "foreverQuests" | "newInForever" | "requiredLevel"
> & { requiredLevel: number };

function lootItems(files: DungeonDataFiles): ReadonlyMap<number, LootItemInfo> {
  const col = columnIndexes("lootItems.json", files.lootItems.columns, ["name", "slot", "itemType"] as const);
  const out = new Map<number, LootItemInfo>();
  for (const [id, row] of Object.entries(files.lootItems.items)) {
    const slot = String(row[col.slot] ?? "");
    const itemType = row[col.itemType];
    out.set(Number(id), {
      name: String(row[col.name]),
      slot: isItemSlot(slot) ? slot : null,
      itemType: typeof itemType === "string" ? itemType : null,
    });
  }
  return out;
}

/** Encounter id -> its loot (an item the names file lacks is dropped, never shown nameless). */
function instanceLoot(
  files: DungeonDataFiles,
  instanceId: number,
  items: ReadonlyMap<number, LootItemInfo>,
): ReadonlyMap<number, BossLootItem[]> {
  const col = columnIndexes("bossLoot.json", files.bossLoot.lootColumns, ["item", "chance"] as const);
  const out = new Map<number, BossLootItem[]>();
  for (const [encounter, rows] of Object.entries(files.bossLoot.instances[String(instanceId)] ?? {})) {
    const loot: BossLootItem[] = [];
    for (const row of rows) {
      const id = Number(row[col.item]);
      const item = items.get(id);
      if (item) loot.push({ id, ...item, chance: Number(row[col.chance]) });
    }
    out.set(Number(encounter), loot);
  }
  return out;
}

function entryRequirements(files: DungeonDataFiles, instanceId: number): DungeonEntryRequirement[] {
  const col = columnIndexes("entryRequirements.json", files.entry.columns, ["trigger", "item", "quest"] as const);
  return (files.entry.instances[String(instanceId)] ?? []).map((row) => ({
    trigger: Number(row[col.trigger]),
    itemId: Number(row[col.item]),
    questId: Number(row[col.quest]),
  }));
}

function lockedDoorKeys(interior: Interior | undefined): string[] {
  return [...new Set(interior?.doors.map((d) => d.key) ?? [])];
}

/** The zone's flight paths are measured from its first door. */
function entranceZone(zone: WorldZone | undefined, zoneId: number, subzone: string, door: DungeonDoor, nodes: readonly FlightNode[]): DungeonEntranceZone {
  return {
    zoneId,
    zoneName: zone?.name ?? "",
    subzone,
    doors: [door],
    flightPaths: zone ? nearestFlightPaths(zoneToWorld(zone, door.x, door.y), nodes) : [],
  };
}

function addDoor(
  zones: readonly DungeonEntranceZone[],
  make: () => DungeonEntranceZone,
  zoneId: number,
  subzone: string,
  door: DungeonDoor,
): DungeonEntranceZone[] {
  const at = zones.findIndex((z) => z.zoneId === zoneId);
  if (at < 0) return [...zones, make()];
  return zones.map((z, i) => (i === at ? { ...z, doors: [...z.doors, door], subzone: z.subzone || subzone } : z));
}

function bossesOf(interior: Interior | undefined, loot: ReadonlyMap<number, BossLootItem[]>): DungeonBoss[] {
  const bosses = interior?.bosses ?? [];
  const slugs = uniqueSlugs(bosses.map((b) => b.name));
  return bosses.map((b, i) => ({ encounter: b.encounter, name: b.name, slug: slugs[i], loot: loot.get(b.encounter) ?? null }));
}

/** The area a new Forever dungeon is in, as a door-less entrance zone; none when the game names no area. */
function foreverArea(
  row: readonly unknown[],
  col: Record<"zone" | "area" | "x" | "y", number>,
  zoneById: ReadonlyMap<number, WorldZone>,
  nodes: readonly FlightNode[],
): DungeonEntranceZone[] {
  if (row[col.zone] === null) return [];
  const zoneId = Number(row[col.zone]);
  const zone = zoneById.get(zoneId);
  if (!zone) return [];
  return [{
    zoneId,
    zoneName: zone.name,
    subzone: String(row[col.area] ?? ""),
    doors: [],
    flightPaths: nearestFlightPaths(zoneToWorld(zone, Number(row[col.x]), Number(row[col.y])), nodes),
  }];
}

/** Forever's own dungeons: the client's level, bosses and area, the Game Data API's quests; no door, loot or entry rules. */
function decodeForeverDungeons(files: DungeonDataFiles, world: DungeonWorld, zoneById: ReadonlyMap<number, WorldZone>): Dungeon[] {
  const foreverQuests = decodeForeverDungeonQuests(files);
  const file = files.foreverDungeons;
  const col = columnIndexes("foreverDungeons.json", file.columns, [
    "instance", "name", "minLevel", "maxLevel", "zone", "area", "x", "y",
  ] as const);
  const bossCol = columnIndexes("foreverDungeons.json bosses", file.bossColumns, ["encounter", "name"] as const);
  return file.rows.map((row) => {
    const instanceId = Number(row[col.instance]);
    const name = String(row[col.name]);
    const bosses = (file.bosses[String(instanceId)] ?? []).map((b) => ({ encounter: Number(b[bossCol.encounter]), name: String(b[bossCol.name]) }));
    const slugs = uniqueSlugs(bosses.map((b) => b.name));
    return {
      slug: dungeonSlug(name),
      instanceId,
      name,
      newInForever: true,
      aliases: INSTANCE_ALIASES[name] ?? [],
      levelMin: Number(row[col.minLevel]),
      levelMax: Number(row[col.maxLevel]),
      requiredLevel: null,
      maxPlayers: files.facts.maxPlayers[String(instanceId)] ?? null,
      entryRequirements: null,
      lockedDoorKeys: [],
      entrances: foreverArea(row, col, zoneById, world.flightNodes),
      bosses: bosses.map((b, i) => ({ ...b, slug: slugs[i], loot: null })),
      interior: null,
      quests: [],
      foreverQuests: foreverQuests(instanceId),
    };
  });
}

/** Every dungeon (raids are left out), Classic and Forever's own together, lowest level first. */
export function decodeDungeons(files: DungeonDataFiles, world: DungeonWorld): DungeonsData {
  const col = columnIndexes("classicDungeons.json", files.dungeons.columns, [
    "trigger", "instance", "name", "wing", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "subzone", "x", "y",
  ] as const);
  const zoneById = new Map(world.zones.map((z) => [z.id, z]));
  const interiors = decodeInteriors(files.interiors);
  const items = lootItems(files);
  const quests = decodeDungeonQuests(files, items, zoneById);
  const byInstance = new Map<number, DungeonBase>();
  for (const row of files.dungeons.rows) {
    if (row[col.type] !== DUNGEON_TYPE) continue;
    const instanceId = Number(row[col.instance]);
    const name = String(row[col.name]);
    const zoneId = Number(row[col.zone]);
    const subzone = String(row[col.subzone] ?? "");
    const door: DungeonDoor = {
      trigger: Number(row[col.trigger]),
      wing: String(row[col.wing] ?? ""),
      x: Number(row[col.x]),
      y: Number(row[col.y]),
    };
    const make = () => entranceZone(zoneById.get(zoneId), zoneId, subzone, door, world.flightNodes);
    const levelMin = Number(row[col.minLevel]);
    const levelMax = Number(row[col.maxLevel]);
    const requiredLevel = Number(row[col.requiredLevel]);
    const known = byInstance.get(instanceId);
    byInstance.set(
      instanceId,
      known
        ? {
            ...known,
            levelMin: Math.min(known.levelMin, levelMin),
            levelMax: Math.max(known.levelMax, levelMax),
            requiredLevel: Math.min(known.requiredLevel, requiredLevel),
            entrances: addDoor(known.entrances, make, zoneId, subzone, door),
          }
        : {
            slug: dungeonSlug(name),
            instanceId,
            name,
            aliases: INSTANCE_ALIASES[name] ?? [],
            levelMin,
            levelMax,
            requiredLevel,
            entrances: [make()],
          },
    );
  }
  const dungeons: Dungeon[] = [...byInstance.values()].map((d) => {
    const interior = interiors.get(d.instanceId);
    return {
      ...d,
      newInForever: false,
      maxPlayers: files.facts.maxPlayers[String(d.instanceId)] ?? null,
      entryRequirements: entryRequirements(files, d.instanceId),
      lockedDoorKeys: lockedDoorKeys(interior),
      bosses: bossesOf(interior, instanceLoot(files, d.instanceId, items)),
      interior: interior ?? null,
      quests: quests(d.instanceId),
      foreverQuests: [],
    };
  });
  // A stable sort keeps each file's own order within a level.
  const all = [...dungeons, ...decodeForeverDungeons(files, world, zoneById)].sort((a, b) => a.levelMin - b.levelMin);
  return { dungeons: all, clientBuild: files.lootItems.clientBuild };
}

/** The dungeon a page's slug names, or null. */
export function findDungeon(data: DungeonsData, slug: string | undefined): Dungeon | null {
  return data.dungeons.find((d) => d.slug === slug) ?? null;
}
