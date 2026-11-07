/**
 * The dungeon pages' data, built from files other pages already ship: the
 * World Map's entrances (`classicDungeons.json` — Forever levels, Classic
 * doors) and interiors (`classicInteriors.json` — the Forever client's bosses
 * in order), the zone names (`zones.json`), plus the dungeon generator's
 * boss loot (`dungeons/classic/bossLoot.json`, Classic chances) and its item
 * names (`dungeons/lootItems.json`, the Forever client).
 */
import { isItemSlot } from "@/games/wow-forever/data/itemSlots";
import { INSTANCE_ALIASES } from "@/games/wow-forever/data/worldMap/placeNames";
import { uniqueSlugs, dungeonSlug } from "@/games/wow-forever/lib/dungeons/dungeonSlug";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import { decodeInteriors } from "@/games/wow-forever/worldMap/interiors";

const DUNGEON_TYPE = "dungeon";

function columnIndexes<const T extends readonly string[]>(file: string, names: readonly string[], wanted: T): Record<T[number], number> {
  const out = {} as Record<T[number], number>;
  for (const w of wanted as readonly T[number][]) {
    const i = names.indexOf(w);
    if (i < 0) throw new Error(`${file}: missing column ${w}`);
    out[w] = i;
  }
  return out;
}

function lootItems(files: DungeonDataFiles): ReadonlyMap<number, Omit<BossLootItem, "id" | "chance">> {
  const col = columnIndexes("lootItems.json", files.lootItems.columns, ["name", "slot", "itemType"] as const);
  const out = new Map<number, Omit<BossLootItem, "id" | "chance">>();
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
  items: ReadonlyMap<number, Omit<BossLootItem, "id" | "chance">>,
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

function addEntrance(zones: DungeonEntranceZone[], zoneId: number, zoneName: string, wing: string, subzone: string): DungeonEntranceZone[] {
  const at = zones.findIndex((z) => z.zoneId === zoneId);
  if (at < 0) return [...zones, { zoneId, zoneName, wings: wing ? [wing] : [], subzone }];
  const zone = zones[at];
  const next = { ...zone, wings: wing ? [...zone.wings, wing] : zone.wings, subzone: zone.subzone || subzone };
  return zones.map((z, i) => (i === at ? next : z));
}

/** Every dungeon (raids are left out), in the entrances file's order: lowest level first. */
export function decodeDungeons(files: DungeonDataFiles): DungeonsData {
  const col = columnIndexes("classicDungeons.json", files.dungeons.columns, [
    "instance", "name", "wing", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "subzone",
  ] as const);
  const zoneNames = new Map(files.zones.zones.map((z) => [z.id, z.name]));
  const interiors = decodeInteriors(files.interiors);
  const items = lootItems(files);
  const byInstance = new Map<number, Omit<Dungeon, "bosses">>();
  for (const row of files.dungeons.rows) {
    if (row[col.type] !== DUNGEON_TYPE) continue;
    const instanceId = Number(row[col.instance]);
    const name = String(row[col.name]);
    const zoneId = Number(row[col.zone]);
    const wing = String(row[col.wing] ?? "");
    const subzone = String(row[col.subzone] ?? "");
    const zoneName = zoneNames.get(zoneId) ?? "";
    const known = byInstance.get(instanceId);
    const levelMin = Number(row[col.minLevel]);
    const levelMax = Number(row[col.maxLevel]);
    const requiredLevel = Number(row[col.requiredLevel]);
    if (!known) {
      byInstance.set(instanceId, {
        slug: dungeonSlug(name),
        instanceId,
        name,
        aliases: INSTANCE_ALIASES[name] ?? [],
        levelMin,
        levelMax,
        requiredLevel,
        entrances: addEntrance([], zoneId, zoneName, wing, subzone),
      });
      continue;
    }
    byInstance.set(instanceId, {
      ...known,
      levelMin: Math.min(known.levelMin, levelMin),
      levelMax: Math.max(known.levelMax, levelMax),
      requiredLevel: Math.min(known.requiredLevel, requiredLevel),
      entrances: addEntrance([...known.entrances], zoneId, zoneName, wing, subzone),
    });
  }
  const dungeons: Dungeon[] = [...byInstance.values()].map((d) => {
    const interior = interiors.get(d.instanceId);
    const loot = instanceLoot(files, d.instanceId, items);
    const names = interior?.bosses.map((b) => b.name) ?? [];
    const slugs = uniqueSlugs(names);
    const bosses: DungeonBoss[] = (interior?.bosses ?? []).map((b, i) => ({
      encounter: b.encounter,
      name: b.name,
      slug: slugs[i],
      loot: loot.get(b.encounter) ?? null,
    }));
    return { ...d, bosses };
  });
  return { dungeons, clientBuild: files.lootItems.clientBuild };
}

/** The dungeon a page's slug names, or null. */
export function findDungeon(data: DungeonsData, slug: string | undefined): Dungeon | null {
  return data.dungeons.find((d) => d.slug === slug) ?? null;
}
