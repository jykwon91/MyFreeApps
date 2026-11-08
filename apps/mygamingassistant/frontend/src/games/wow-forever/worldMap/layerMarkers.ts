/**
 * The switchable map layers: every marker of each layer on the viewed map
 * (so a toggle can say "Flight masters (3)"), and the markers of the layers
 * switched on. Every layer but dungeons and rares is your faction + neutral
 * only — the other side's guards attack you.
 */
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { LAZY_LAYER_SOURCES, MAP_LAYER_DEFS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { MAP_LAYER_IDS, type MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { PROFESSION_LABEL, SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { LayerContext } from "@/games/wow-forever/types/mapLayers/layerContext";
import type { LayerCounts } from "@/games/wow-forever/types/mapLayers/layerCounts";
import type { LazyLayerSource } from "@/games/wow-forever/types/mapLayers/lazyLayerSource";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapLayerDef } from "@/games/wow-forever/types/mapLayers/mapLayerDef";
import type { MapLayerSource } from "@/games/wow-forever/types/mapLayers/mapLayerSource";
import { FACTION, type MapPoi, type MapView, type WorldMapData, type WorldPoint } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { questsFor } from "@/games/wow-forever/worldMap/levels";
import type { MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import { mapShows } from "@/games/wow-forever/worldMap/mapGeometry";
import { usableBy } from "@/games/wow-forever/worldMap/nearest";
import { poiMarkerClass, poiMarkerLabel } from "@/games/wow-forever/worldMap/poiDisplay";
import { rareMarkerId } from "@/games/wow-forever/lib/rares/rareMarkerId";
import { rareMarkerLabel } from "@/games/wow-forever/lib/rares/rareText";

export type LayerMarkers = ReadonlyMap<MapLayerId, readonly MapMarker[]>;

const poiWorld = new WeakMap<MapPoi, WorldPoint | null>();

function worldOf(poi: MapPoi, data: WorldMapData): WorldPoint | null {
  let world = poiWorld.get(poi);
  if (world === undefined) {
    const zone = data.zoneById.get(poi.zone);
    world = zone ? zoneToWorld(zone, poi.x, poi.y) : null;
    poiWorld.set(poi, world);
  }
  return world;
}

function poiMarker(poi: MapPoi, data: WorldMapData): MapMarker | null {
  const world = worldOf(poi, data);
  return world && { id: poi.id, world, label: poiMarkerLabel(poi), className: poiMarkerClass(poi), zoneId: poi.zone };
}

function poisOf(source: MapLayerSource, data: WorldMapData, ctx: LayerContext): readonly MapPoi[] {
  switch (source.kind) {
    case "service":
      return data.pois.filter(
        (p) => p.subkind === source.subkind && (source.tag === undefined || p.tag === source.tag) && usableBy(p, ctx.faction, false),
      );
    case "class_trainer":
      return data.pois.filter((p) => p.subkind === SERVICE_KIND.classTrainer && p.tag === ctx.classId && usableBy(p, ctx.faction, false));
    case "quest_givers":
      return data.questGivers.filter(
        (p) => usableBy(p, ctx.faction, false) && questsFor(p.quests ?? [], ctx.faction, ctx.classId, ctx.level).length > 0,
      );
    case "instances":
      return data.instances;
    default:
      return [];
  }
}

/** Each stop of each boat / zeppelin / tram you may ride: "Ratchet dock — Boat: Ratchet - Booty Bay". */
function transportMarkers(def: MapLayerDef, data: WorldMapData, ctx: LayerContext): MapMarker[] {
  return data.transports
    .filter((t) => t.faction === FACTION.neutral || t.faction === ctx.faction)
    .flatMap((t) =>
      t.stops.map((stop, i) => ({
        id: `transport:${t.id}:${i}`,
        world: stop.world,
        label: `${stop.label} — ${t.name}`,
        className: def.markerClass,
        zoneId: stop.zone,
      })),
    );
}

function gatheringMarkers(def: MapLayerDef, skill: string, data: WorldMapData, ctx: LayerContext): MapMarker[] {
  return (ctx.gathering ?? [])
    .filter((s) => s.skill === skill)
    .flatMap((s) => {
      const zone = data.zoneById.get(s.zoneId);
      if (!zone) return [];
      const where = s.subzone ? `${s.subzone}, ${zone.name}` : zone.name;
      return [
        {
          id: s.id,
          world: zoneToWorld(zone, s.x, s.y),
          label: `${s.name} — ${s.count} in ${where} (skill ${s.level})`,
          className: def.markerClass,
          zoneId: zone.id,
        },
      ];
    });
}

/** Every spawn spot of every rare (any faction can fight them): "Morgaine the Sly — level 10 rare". */
function rareMarkers(def: MapLayerDef, data: WorldMapData, ctx: LayerContext): MapMarker[] {
  return (ctx.rares ?? []).flatMap((rare) =>
    rare.spawns.flatMap((spawn, i) => {
      const zone = data.zoneById.get(spawn.zoneId);
      if (!zone) return [];
      return [
        {
          id: rareMarkerId(rare.id, i),
          world: zoneToWorld(zone, spawn.x, spawn.y),
          label: rareMarkerLabel(rare),
          className: def.markerClass,
          zoneId: zone.id,
        },
      ];
    }),
  );
}

function allMarkers(def: MapLayerDef, data: WorldMapData, ctx: LayerContext): MapMarker[] {
  const { source } = def;
  if (source.kind === "transport") return transportMarkers(def, data, ctx);
  if (source.kind === "gathering") return gatheringMarkers(def, source.skill, data, ctx);
  if (source.kind === "rares") return rareMarkers(def, data, ctx);
  return poisOf(source, data, ctx).flatMap((p) => poiMarker(p, data) ?? []);
}

/** Every layer's markers that fall on `map` (zone maps also show what's just over their borders, like the results do). */
export function markersByLayer(data: WorldMapData, map: MapView, ctx: LayerContext): LayerMarkers {
  return new Map(MAP_LAYER_DEFS.map((def) => [def.id, allMarkers(def, data, ctx).filter((m) => mapShows(map, m.world))]));
}

function isLazySource(kind: MapLayerSource["kind"]): kind is LazyLayerSource {
  return LAZY_LAYER_SOURCES.has(kind as LazyLayerSource);
}

/** How many markers each layer has on the map; the Gathering and Rares layers are null until their files have loaded. */
export function layerCounts(byLayer: LayerMarkers, loaded: Pick<LayerContext, LazyLayerSource>): LayerCounts {
  const counts = {} as Record<MapLayerId, number | null>;
  for (const def of MAP_LAYER_DEFS) {
    const { kind } = def.source;
    counts[def.id] = isLazySource(kind) && loaded[kind] === null ? null : (byLayer.get(def.id)?.length ?? 0);
  }
  return counts;
}

/** Markers from both lists, each once (the first list wins, so its colour and label are kept). */
export function mergeMarkers(first: readonly MapMarker[], second: readonly MapMarker[]): MapMarker[] {
  const merged = [...first];
  const seen = new Set(first.map((m) => m.id));
  for (const m of second) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  return merged;
}

/** The markers of every switched-on layer, each once. */
export function visibleLayerMarkers(byLayer: LayerMarkers, choice: MapLayerChoice): MapMarker[] {
  return MAP_LAYER_IDS.filter((id) => choice[id]).reduce<MapMarker[]>((all, id) => mergeMarkers(all, byLayer.get(id) ?? []), []);
}

/** The toggle's name: the class trainer layer is "Warlock trainers"; profession layers get "trainers" in the panel's group. */
export function layerLabel(def: MapLayerDef, classId: WowClassId): string {
  if (def.source.kind === "class_trainer") return `${findClass(classId)?.name ?? "Class"} trainers`;
  if (def.source.kind === "service" && def.source.tag) return PROFESSION_LABEL[def.source.tag] ?? def.label;
  return def.label;
}

/** Layers switched on. */
export function activeLayerCount(choice: MapLayerChoice): number {
  return MAP_LAYER_IDS.filter((id) => choice[id]).length;
}

/** A toggle's count: "3", or why there's none yet. */
export function layerCountText(count: number | null, failed: boolean): string {
  if (count !== null) return String(count);
  return failed ? "didn't load" : "loading";
}
