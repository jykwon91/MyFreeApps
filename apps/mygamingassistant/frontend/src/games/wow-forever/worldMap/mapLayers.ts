import type { WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import type { Directions, StepKind } from "@/games/wow-forever/worldMap/directions";
import type { RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { poiMarkerClass, poiMarkerLabel } from "@/games/wow-forever/worldMap/poiDisplay";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** Optional map layers the player can switch on. Services are always shown. */
export interface MapLayerChoice {
  questGivers: boolean;
  instances: boolean;
}

/** A result drawn on the map. */
export interface MapMarker {
  id: string;
  world: WorldPoint;
  label: string;
  className: string;
}

/** A numbered direction step drawn on the map, reached by `kind` (walk / fly / boat / zeppelin). */
export interface MapStop {
  world: WorldPoint;
  number: number;
  label: string;
  kind: StepKind;
}

/** A named spot drawn on every map level: the trip's start (A) and destination (B). */
export interface MapDestination {
  world: WorldPoint;
  label: string;
}

/** The trip on the map: B alone while choosing, then A -> numbered stops -> B once directions are open. */
export interface MapRoute {
  origin: MapDestination | null;
  destination: MapDestination;
  stops: readonly MapStop[];
}

/** "Fit the map to these": once `mapId` is on screen, zoom so every point shows (one point: zoom in on it; none: whole map). */
export interface MapFit {
  mapId: number;
  points: readonly WorldPoint[];
  nonce: number;
}

/**
 * "Show this result on the map": once the map `mapId` is on screen, zoom
 * to the marker `poiId`. `nonce` makes picking the same row again re-centre it.
 */
export interface MapFocus {
  poiId: string;
  mapId: number;
  nonce: number;
  /** Scroll the map on screen (stacked layout). Off when the list shows the result instead. */
  reveal: boolean;
}

/** Result markers: the hero picks, the Find list and any switched-on layer, each once. */
export function resultMarkers(model: WorldMapModel, layers: MapLayerChoice): MapMarker[] {
  const seen = new Set<string>();
  const markers: MapMarker[] = [];
  const ranked: RankedPoi[] = [...model.hero.flatMap((h) => (h.best ? [h.best] : [])), ...model.findResults];
  if (layers.questGivers) ranked.push(...model.questGivers.map((g) => g.ranked));
  if (layers.instances) ranked.push(...model.instances);
  if (model.selected) ranked.push(model.selected);
  for (const r of ranked) {
    if (seen.has(r.poi.id)) continue;
    seen.add(r.poi.id);
    markers.push({ id: r.poi.id, world: r.world, label: poiMarkerLabel(r.poi), className: poiMarkerClass(r.poi) });
  }
  return markers;
}

/** Numbered direction stops, placed in the world so any map can draw them. */
export function directionStops(directions: Directions | null, data: WorldMapData): MapStop[] {
  if (!directions) return [];
  return directions.steps.flatMap((step, i) => {
    const zone = data.zoneById.get(step.place.zoneId);
    if (!zone) return [];
    return [{ number: i + 1, label: step.place.label, kind: step.kind, world: zoneToWorld(zone, step.place.x, step.place.y) }];
  });
}

/** Before the player has a zone there are no results — only the chosen NPC, if any, is drawn. */
export function selectedOnlyMarkers(poiId: string | null, data: WorldMapData): MapMarker[] {
  const poi = poiId === null ? undefined : data.poiById.get(poiId);
  const zone = poi && data.zoneById.get(poi.zone);
  if (!poi || !zone) return [];
  return [{ id: poi.id, world: zoneToWorld(zone, poi.x, poi.y), label: poiMarkerLabel(poi), className: poiMarkerClass(poi) }];
}
