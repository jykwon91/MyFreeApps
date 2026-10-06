import { TERRITORY, type Faction, type Territory } from "@/games/wow-forever/types/worldMap";
import { MOB_KIND } from "@/games/wow-forever/types/recipeSources";
import type {
  ContainerDrop,
  DisenchantFrom,
  DisenchantSource,
  DropMob,
  DropSource,
  ItemSources,
  MobKind,
  MobSpot,
  ObjectSpot,
  QuestGiver,
  QuestSource,
  SkinningSource,
  VendorSpot,
} from "@/games/wow-forever/types/recipeSources";

/**
 * Decodes the compact "where does it come from" files written by
 * `scripts/wow_food/recipe_sources.py` (cmangos classic-db, GPL-3.0 — Classic
 * values that may differ in Forever). The food pages and the crafting guides
 * each ship their own file in this shape.
 */

type Row = readonly (string | number | boolean | null)[];

export interface RawSources {
  vendors?: Row[];
  quests?: number[];
  drop?: { world: boolean; levels: number[]; mobs: Row[]; more: number; zones: number[] };
  skinning?: { levels: number[]; zones: number[] };
  fishing?: string[];
  containers?: string[];
  /** `[name, count, zone, subzone, x, y]`. */
  objectSpots?: Row[];
  containerDrops?: [string, NonNullable<RawSources["drop"]>][];
}

export interface RawSourcesFile {
  source: string;
  zones: Record<string, string>;
  /** Zone id -> "alliance" / "horde" / "contested". */
  territory?: Record<string, string>;
  quests: Record<string, Row>;
  recipes: Record<string, RawSources>;
  reagents: Record<string, RawSources>;
  /** Item id -> `[minLevel, maxLevel, chance, mostlyFrom, fromBlue]` (the crafting file only). */
  disenchant?: Record<string, Row>;
}

export interface SourceLookup {
  /** e.g. "cmangos/classic-db@ec4f596…". */
  source: string;
  /** Where to get the recipe keyed by `id` (a food id, or a Pattern / Formula item id). */
  recipe(id: number): ItemSources;
  /** Where to get a reagent. */
  reagent(itemId: number): ItemSources;
}

const MOB_KINDS: readonly string[] = Object.values(MOB_KIND);

/** The data's "kind" column; anything unknown (or missing, in older rows) is a mob to farm. */
function mobKind(value: unknown): MobKind {
  return MOB_KINDS.includes(String(value)) ? (String(value) as MobKind) : MOB_KIND.farm;
}

export function createSourceLookup(raw: RawSourcesFile): SourceLookup {
  function zoneName(zoneId: number): string {
    return raw.zones[String(zoneId)] ?? "";
  }

  function territory(zoneId: number): Territory | null {
    const side = raw.territory?.[String(zoneId)];
    return Object.values(TERRITORY).find((t) => t === side) ?? null;
  }

  function vendor(r: Row): VendorSpot {
    const [npcId, name, title, zoneId, subzone, x, y, faction, stock, restockMinutes] = r;
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
      limited: Number(stock) > 0,
      stock: Number(stock),
      restockMinutes: Number(restockMinutes),
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
    const row = raw.quests[String(id)];
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

  function spotAt(zoneId: Row[number], subzone: Row[number], x: Row[number], y: Row[number]): MobSpot | null {
    if (zoneId === null || zoneId === undefined) return null;
    return {
      zoneId: Number(zoneId),
      zoneName: zoneName(Number(zoneId)),
      subzone: String(subzone ?? ""),
      x: Number(x),
      y: Number(y),
      territory: territory(Number(zoneId)),
    };
  }

  function mob(r: Row): DropMob {
    const [name, minLevel, maxLevel, chance, zoneId, subzone, x, y, kind] = r;
    return {
      name: String(name),
      minLevel: Number(minLevel),
      maxLevel: Number(maxLevel),
      chance: Number(chance),
      spot: spotAt(zoneId, subzone, x, y),
      kind: mobKind(kind),
    };
  }

  function objectSpot(r: Row): ObjectSpot | null {
    const [name, count, zoneId, subzone, x, y] = r;
    const spot = spotAt(zoneId, subzone, x, y);
    return spot ? { name: String(name), count: Number(count), spot } : null;
  }

  function drop(d: RawSources["drop"]): DropSource | null {
    if (!d) return null;
    return {
      world: d.world,
      levels: [d.levels[0], d.levels[1]],
      mobs: d.mobs.map(mob),
      more: d.more,
      zones: d.zones.map(zoneName).filter(Boolean),
    };
  }

  function skinning(s: RawSources["skinning"]): SkinningSource | null {
    if (!s) return null;
    return { levels: [s.levels[0], s.levels[1]], zones: s.zones.map(zoneName).filter(Boolean) };
  }

  function disenchant(itemId: number): DisenchantSource | null {
    const row = raw.disenchant?.[String(itemId)];
    if (!row) return null;
    const [minLevel, maxLevel, chance, mostlyFrom, fromBlue] = row;
    return {
      minLevel: Number(minLevel),
      maxLevel: Number(maxLevel),
      chance: Number(chance),
      mostlyFrom: (mostlyFrom ?? null) as DisenchantFrom | null,
      fromBlue: Boolean(fromBlue),
    };
  }

  function decode(r: RawSources | undefined, itemId: number | null): ItemSources {
    return {
      vendors: (r?.vendors ?? []).map(vendor),
      quests: (r?.quests ?? []).map(quest).filter((q): q is QuestSource => q !== null),
      drop: drop(r?.drop),
      skinning: skinning(r?.skinning),
      disenchant: itemId === null ? null : disenchant(itemId),
      fishing: r?.fishing ?? [],
      containers: r?.containers ?? [],
      objectSpots: (r?.objectSpots ?? []).map(objectSpot).filter((s): s is ObjectSpot => s !== null),
      containerDrops: (r?.containerDrops ?? []).flatMap(([name, d]): ContainerDrop[] => {
        const decoded = drop(d);
        return decoded ? [{ name, drop: decoded }] : [];
      }),
    };
  }

  return {
    source: raw.source,
    recipe: (id) => decode(raw.recipes[String(id)], null),
    reagent: (itemId) => decode(raw.reagents[String(itemId)], itemId),
  };
}
