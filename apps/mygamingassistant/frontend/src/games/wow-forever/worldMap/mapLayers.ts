import type { WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
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

/** A numbered direction step drawn on the map. */
export interface MapStop {
  world: WorldPoint;
  number: number;
  label: string;
}

/** The chosen result, drawn on every map level so a route reads as one picture. */
export interface MapDestination {
  world: WorldPoint;
  label: string;
}

/**
 * "Show this result on the map": once the map `mapId` is on screen, zoom
 * to the marker `poiId`. `nonce` makes picking the same row again re-centre it.
 */
export interface MapFocus {
  poiId: string;
  mapId: number;
  nonce: number;
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
export function directionStops(model: WorldMapModel, data: WorldMapData): MapStop[] {
  if (!model.directions) return [];
  return model.directions.steps.flatMap((step, i) => {
    const zone = data.zoneById.get(step.place.zoneId);
    if (!zone) return [];
    return [{ number: i + 1, label: step.place.label, world: zoneToWorld(zone, step.place.x, step.place.y) }];
  });
}
