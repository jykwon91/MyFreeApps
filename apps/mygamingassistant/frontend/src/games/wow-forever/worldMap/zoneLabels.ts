/**
 * Zone name + level labels on a continent map. Each sits at the point of its
 * zone deepest inside the zone's outline (so a crescent-shaped zone's label
 * isn't in its neighbour), and labels that would overlap at the current
 * on-screen size are dropped, biggest zones first — zooming in brings the
 * rest back.
 */
import { MAP_KIND, type MapMask, type MapView, type WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { ZoneLabel } from "@/games/wow-forever/types/mapLayers/zoneLabel";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { childrenOf } from "@/games/wow-forever/worldMap/mapHitTest";
import { projectRect, worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import { zoneLevelText } from "@/games/wow-forever/worldMap/zoneFit";

/** Rough width of one label character on screen (12px semibold) — enough to keep labels apart. */
export const LABEL_CHAR_PX = 6.6;
/** Two lines (name, levels) plus padding. */
export const LABEL_HEIGHT_PX = 32;
const LABEL_PAD_PX = 8;
/** Space kept between labels. */
const LABEL_GAP_PX = 4;

export interface LabelBox {
  width: number;
  height: number;
}

/** Map percent of the mask cell farthest from the zone's edge (its "pole"), plus how much of the rectangle is land. */
function maskPole(mask: MapMask): { x: number; y: number; fill: number } | null {
  const { width, height, bits } = mask;
  const dist = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  let inside = 0;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = row * width + col;
      if (bits[i] !== 1) continue;
      inside += 1;
      const edge =
        col === 0 || row === 0 || col === width - 1 || row === height - 1 ||
        bits[i - 1] !== 1 || bits[i + 1] !== 1 || bits[i - width] !== 1 || bits[i + width] !== 1;
      if (edge) {
        dist[i] = 1;
        queue.push(i);
      }
    }
  }
  if (inside === 0) return null;
  let best = queue[0];
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    if (dist[i] > dist[best]) best = i;
    const col = i % width;
    const neighbours = [col > 0 ? i - 1 : -1, col < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const n of neighbours) {
      if (n < 0 || n >= bits.length || bits[n] !== 1 || dist[n] !== -1) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return {
    x: (((best % width) + 0.5) / width) * 100,
    y: ((Math.floor(best / width) + 0.5) / height) * 100,
    fill: inside / (width * height),
  };
}

function labelDetail(child: MapView): string {
  const zone = child.zone;
  if (!zone) return "";
  if (child.kind === MAP_KIND.city) return "City";
  if (zone.levels) return zoneLevelText(zone.levels);
  if (zone.foreverOnly) return "New in Forever";
  return "";
}

function buildLabels(data: WorldMapData, map: MapView): ZoneLabel[] {
  if (map.kind !== MAP_KIND.continent) return [];
  return childrenOf(data, map.id).flatMap((child): ZoneLabel[] => {
    const zone = child.zone;
    const rect = zone && projectRect(map, zone);
    if (!zone || !rect) return [];
    const mask = data.masks.get(child.id);
    const pole = mask ? maskPole(mask) : null;
    const at = pole ? worldToMap(map, zoneToWorld(zone, pole.x, pole.y)) : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (!at) return [];
    return [
      { zoneId: zone.id, name: child.name, detail: labelDetail(child), x: at.x, y: at.y, priority: rect.width * rect.height * (pole?.fill ?? 1) },
    ];
  });
}

const cache = new WeakMap<WorldMapData, Map<number, ZoneLabel[]>>();

/** Every zone label a continent map could show, biggest zone first; none on other maps. */
export function zoneLabels(data: WorldMapData, map: MapView): readonly ZoneLabel[] {
  let byMap = cache.get(data);
  if (!byMap) {
    byMap = new Map();
    cache.set(data, byMap);
  }
  let labels = byMap.get(map.id);
  if (!labels) {
    labels = buildLabels(data, map).sort((a, b) => b.priority - a.priority);
    byMap.set(map.id, labels);
  }
  return labels;
}

/** A label's size on screen. */
export function labelBox(label: Pick<ZoneLabel, "name" | "detail">, extraChars = 0): LabelBox {
  const chars = Math.max(label.name.length, label.detail.length + extraChars);
  return { width: chars * LABEL_CHAR_PX + LABEL_PAD_PX, height: LABEL_HEIGHT_PX };
}

/**
 * The labels that fit on a picture drawn `widthPx` × `heightPx` on screen,
 * highest priority first, none overlapping another. `extraChars` widens the
 * level line (the fit symbol in front of it).
 */
export function placeZoneLabels(labels: readonly ZoneLabel[], widthPx: number, heightPx: number, extraChars = 0): ZoneLabel[] {
  const placed: { label: ZoneLabel; left: number; top: number; right: number; bottom: number }[] = [];
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    const box = labelBox(label, extraChars);
    const cx = (label.x / 100) * widthPx;
    const cy = (label.y / 100) * heightPx;
    const rect = { left: cx - box.width / 2, top: cy - box.height / 2, right: cx + box.width / 2, bottom: cy + box.height / 2 };
    const overlaps = placed.some(
      (p) =>
        rect.left < p.right + LABEL_GAP_PX &&
        rect.right + LABEL_GAP_PX > p.left &&
        rect.top < p.bottom + LABEL_GAP_PX &&
        rect.bottom + LABEL_GAP_PX > p.top,
    );
    if (!overlaps) placed.push({ label, ...rect });
  }
  return placed.map((p) => p.label);
}
