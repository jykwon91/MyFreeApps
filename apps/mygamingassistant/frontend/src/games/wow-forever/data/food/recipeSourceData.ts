import sourcesJson from "@/games/wow-forever/data/food/classic/recipeSources.json";
import type { Faction } from "@/games/wow-forever/types/worldMap";
import type { DropSource, ItemSources, QuestGiver, QuestSource, VendorSpot } from "@/games/wow-forever/types/recipeSources";

/**
 * Where recipes and reagents come from — vendors, quests, drops, fishing,
 * containers. GENERATED from cmangos classic-db (GPL-3.0, Classic values that
 * may differ in Forever) by `python -m scripts.wow_food.build`.
 */

type Row = readonly (string | number | boolean | null)[];

interface RawSources {
  vendors?: Row[];
  quests?: number[];
  drop?: { world: boolean; levels: number[]; mobs: Row[]; more: number; zones: number[] };
  fishing?: string[];
  containers?: string[];
}

interface RawFile {
  source: string;
  zones: Record<string, string>;
  quests: Record<string, Row>;
  recipes: Record<string, RawSources>;
  reagents: Record<string, RawSources>;
}

const RAW = sourcesJson as unknown as RawFile;

/** e.g. "cmangos/classic-db@ec4f596…". */
export const RECIPE_SOURCE_DATA: string = RAW.source;

function zoneName(zoneId: number): string {
  return RAW.zones[String(zoneId)] ?? "";
}

function vendor(r: Row): VendorSpot {
  const [npcId, name, title, zoneId, subzone, x, y, faction, limited] = r;
  return {
    npcId: Number(npcId),
    name: String(name),
    title: String(title),
    zoneId: Number(zoneId),
    zoneName: zoneName(Number(zoneId)),
    subzone: String(subzone),
    x: Number(x),
    y: Number(y),
    faction: faction as Faction,
    limited: Boolean(limited),
  };
}

function giver(r: Row): QuestGiver {
  const [kind, , name, zoneId, subzone, x, y] = r;
  return {
    kind: kind === "object" ? "object" : "npc",
    name: String(name),
    zoneId: Number(zoneId),
    zoneName: zoneName(Number(zoneId)),
    subzone: String(subzone ?? ""),
    x: Number(x),
    y: Number(y),
  };
}

function quest(id: number): QuestSource | null {
  const row = RAW.quests[String(id)];
  if (!row) return null;
  const [, title, level, side, givers] = row;
  return {
    id,
    title: String(title),
    level: Number(level),
    side: side as Faction,
    givers: (givers as unknown as Row[]).map(giver),
  };
}

function drop(raw: RawSources["drop"]): DropSource | null {
  if (!raw) return null;
  return {
    world: raw.world,
    levels: [raw.levels[0], raw.levels[1]],
    mobs: raw.mobs.map(([name, minLevel, maxLevel, chance]) => ({
      name: String(name),
      minLevel: Number(minLevel),
      maxLevel: Number(maxLevel),
      chance: Number(chance),
    })),
    more: raw.more,
    zones: raw.zones.map(zoneName).filter(Boolean),
  };
}

function decode(raw: RawSources | undefined): ItemSources {
  return {
    vendors: (raw?.vendors ?? []).map(vendor),
    quests: (raw?.quests ?? []).map(quest).filter((q): q is QuestSource => q !== null),
    drop: drop(raw?.drop),
    fishing: raw?.fishing ?? [],
    containers: raw?.containers ?? [],
  };
}

/** Where to get the recipe for this cooked item (keyed by the food's id). */
export function recipeSourcesFor(foodId: number): ItemSources {
  return decode(RAW.recipes[String(foodId)]);
}

/** Where to get a reagent. */
export function reagentSourcesFor(itemId: number): ItemSources {
  return decode(RAW.reagents[String(itemId)]);
}
