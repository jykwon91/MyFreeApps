import type { WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import type { RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { poiMarkerClass, poiMarkerLabel } from "@/games/wow-forever/worldMap/poiDisplay";
import type { ZoneMapMarker, ZoneMapStop } from "@/games/wow-forever/components/worldMap/ZoneMap";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** Optional map layers the player can switch on. Services are always shown. */
export interface MapLayerChoice {
  questGivers: boolean;
  instances: boolean;
}

/** Result markers: the hero picks, the Find list and any switched-on layer, each once. */
export function resultMarkers(model: WorldMapModel, layers: MapLayerChoice): ZoneMapMarker[] {
  const seen = new Set<string>();
  const markers: ZoneMapMarker[] = [];
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

/** Numbered direction stops, placed in the world so any zone map can draw them. */
export function directionStops(model: WorldMapModel, data: WorldMapData): ZoneMapStop[] {
  if (!model.directions) return [];
  return model.directions.steps.flatMap((step, i) => {
    const zone = data.zoneById.get(step.place.zoneId);
    if (!zone) return [];
    return [{ number: i + 1, label: step.place.label, world: zoneToWorld(zone, step.place.x, step.place.y) }];
  });
}

/** Which map to show: the one you picked, else your zone. */
export function viewedZone(model: WorldMapModel, data: WorldMapData, pickedZoneId: number | null): WorldZone {
  return (pickedZoneId !== null && data.zoneById.get(pickedZoneId)) || model.zone;
}
