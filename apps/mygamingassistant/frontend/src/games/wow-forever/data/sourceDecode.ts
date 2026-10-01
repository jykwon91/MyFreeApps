import type { Faction } from "@/games/wow-forever/types/worldMap";
import type { DropMob, DropSource, ItemSources, QuestGiver, QuestSource, VendorSpot } from "@/games/wow-forever/types/recipeSources";

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
  fishing?: string[];
  containers?: string[];
}

export interface RawSourcesFile {
  source: string;
  zones: Record<string, string>;
  quests: Record<string, Row>;
  recipes: Record<string, RawSources>;
  reagents: Record<string, RawSources>;
}

export interface SourceLookup {
  /** e.g. "cmangos/classic-db@ec4f596…". */
  source: string;
  /** Where to get the recipe keyed by `id` (a food id, or a Pattern / Formula item id). */
  recipe(id: number): ItemSources;
  /** Where to get a reagent. */
  reagent(itemId: number): ItemSources;
}

export function createSourceLookup(raw: RawSourcesFile): SourceLookup {
  function zoneName(zoneId: number): string {
    return raw.zones[String(zoneId)] ?? "";
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

  function mob(r: Row): DropMob {
    const [name, minLevel, maxLevel, chance, zoneId, subzone, x, y] = r;
    return {
      name: String(name),
      minLevel: Number(minLevel),
      maxLevel: Number(maxLevel),
      chance: Number(chance),
      spot:
        zoneId === null || zoneId === undefined
          ? null
          : { zoneId: Number(zoneId), zoneName: zoneName(Number(zoneId)), subzone: String(subzone ?? ""), x: Number(x), y: Number(y) },
    };
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

  function decode(r: RawSources | undefined): ItemSources {
    return {
      vendors: (r?.vendors ?? []).map(vendor),
      quests: (r?.quests ?? []).map(quest).filter((q): q is QuestSource => q !== null),
      drop: drop(r?.drop),
      fishing: r?.fishing ?? [],
      containers: r?.containers ?? [],
    };
  }

  return {
    source: raw.source,
    recipe: (id) => decode(raw.recipes[String(id)]),
    reagent: (itemId) => decode(raw.reagents[String(itemId)]),
  };
}
