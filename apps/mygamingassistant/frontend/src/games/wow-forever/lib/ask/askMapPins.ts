/**
 * The pins on an Ask card's mini map. Results that would sit on top of each
 * other (three warlock trainers in Ironforge) are grouped by the World Map's
 * own `clusterMarkers`, so each group is one pin with a count; the picked
 * row is never grouped, so it always stands alone and highlighted.
 */
import { MAP_H, MAP_W } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import { clusterMarkers, type MarkerPx } from "@/games/wow-forever/worldMap/markerClusters";

/** Rendered pixels per map pixel: the mini map is about 400 px wide, so pins 20 px apart or less overlap. */
export const MINI_MAP_SCALE = 0.4;

const PERCENT = 100;

export interface AskPin {
  /** The first member's poi id. */
  id: string;
  /** Position on the map, in percent. */
  x: number;
  y: number;
  rows: readonly AskNpcRow[];
}

export function askMapPins(rows: readonly AskNpcRow[], selectedId: string | null): AskPin[] {
  const byId = new Map(rows.map((row) => [row.poiId, row]));
  const placed: MarkerPx[] = rows.map((row) => ({
    marker: { id: row.poiId, world: { continent: 0, wx: row.x, wy: row.y }, label: row.name, className: "" },
    px: (row.x / PERCENT) * MAP_W,
    py: (row.y / PERCENT) * MAP_H,
  }));
  return clusterMarkers(placed, MINI_MAP_SCALE, selectedId).map((cluster) => ({
    id: cluster.id,
    x: (cluster.px / MAP_W) * PERCENT,
    y: (cluster.py / MAP_H) * PERCENT,
    rows: cluster.members.flatMap((m) => byId.get(m.id) ?? []),
  }));
}

/** "Rows 1, 2, 3 are here. Pick one in the list to see it." */
export function pinTitle(pin: AskPin): string {
  return `Rows ${pin.rows.map((r) => r.n).join(", ")} are here. Pick one in the list to see it.`;
}
