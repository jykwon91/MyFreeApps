import { SERVICE_LABEL, SERVICE_MARKER_CLASS } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import type { ZoneMapMarker, ZoneMapStop } from "@/games/wow-forever/components/worldMap/ZoneMap";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

/** Result markers: the hero picks plus everything the Find list shows, each once. */
export function resultMarkers(model: WorldMapModel): ZoneMapMarker[] {
  const seen = new Set<string>();
  const markers: ZoneMapMarker[] = [];
  const ranked = [...model.hero.flatMap((h) => (h.best ? [h.best] : [])), ...model.findResults];
  for (const r of ranked) {
    if (seen.has(r.poi.id)) continue;
    seen.add(r.poi.id);
    markers.push({
      id: r.poi.id,
      world: r.world,
      label: `${r.poi.name}${r.poi.title ? ` <${r.poi.title}>` : ""} — ${SERVICE_LABEL[r.poi.subkind]}`,
      className: SERVICE_MARKER_CLASS[r.poi.subkind],
    });
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
