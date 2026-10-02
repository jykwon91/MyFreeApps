/**
 * Markers that would sit on top of each other at the current zoom (three
 * warlock trainers in Ironforge, seen from the Eastern Kingdoms) are drawn
 * as one numbered marker. A click on it opens the map where they separate.
 */
import type { MapView, WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { mapPath } from "@/games/wow-forever/worldMap/mapHitTest";
import type { MapFit, MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import { commonMapOf } from "@/games/wow-forever/worldMap/mapSearch";

/** Markers closer than this on screen (map pixels at zoom 1) are one cluster — a marker is ~20 across. */
export const CLUSTER_DISTANCE = 20;
/** A cluster click may zoom in further than "show on map" does, to pull its markers apart. */
export const CLUSTER_MAX_SCALE = 6;

export interface MarkerPx {
  marker: MapMarker;
  px: number;
  py: number;
}

export interface MarkerCluster {
  /** Stable id: the first member's. */
  id: string;
  px: number;
  py: number;
  members: readonly MapMarker[];
}

/**
 * Group markers that overlap at zoom `scale`. Markers keep their size on
 * screen, so on the map picture they're `CLUSTER_DISTANCE / scale` apart.
 * The chosen marker is never grouped — it stays visible and named.
 */
export function clusterMarkers(placed: readonly MarkerPx[], scale: number, keepId: string | null): MarkerCluster[] {
  const reach = CLUSTER_DISTANCE / scale;
  const clusters: { anchor: MarkerPx; members: MarkerPx[] }[] = [];
  const kept: MarkerPx[] = [];
  for (const m of placed) {
    if (m.marker.id === keepId) {
      kept.push(m);
      continue;
    }
    const near = clusters.find((c) => Math.hypot(c.anchor.px - m.px, c.anchor.py - m.py) < reach);
    if (near) near.members.push(m);
    else clusters.push({ anchor: m, members: [m] });
  }
  const groups = [...clusters.map((c) => c.members), ...kept.map((m) => [m])];
  return groups.map((members) => ({
    id: members[0].marker.id,
    px: members.reduce((sum, m) => sum + m.px, 0) / members.length,
    py: members.reduce((sum, m) => sum + m.py, 0) / members.length,
    members: members.map((m) => m.marker),
  }));
}

/** "3 here: Alexander Calder, Briarthorn, Thistleheart" — names only, the kind is the same. */
export function clusterLabel(members: readonly MapMarker[]): string {
  const names = members.map((m) => m.label.split(" <")[0].split(" — ")[0]);
  return `${members.length} here: ${names.join(", ")}. Click to zoom in.`;
}

/**
 * Where a cluster click goes: the smallest map holding all its markers when
 * that's a closer look than this one (Eastern Kingdoms -> Ironforge),
 * else this map, zoomed in on them.
 */
export function clusterFit(data: WorldMapData, map: MapView, members: readonly MapMarker[]): MapFit {
  const zoneIds = members.flatMap((m) => (m.zoneId === undefined ? [] : [m.zoneId]));
  const common = zoneIds.length === members.length ? commonMapOf(data, zoneIds) : map.id;
  const deeper = common !== map.id && data.maps.has(common) && mapPath(data, common).length > mapPath(data, map.id).length;
  const points: WorldPoint[] = members.map((m) => m.world);
  return { mapId: deeper ? common : map.id, points, nonce: Date.now(), maxScale: CLUSTER_MAX_SCALE };
}
