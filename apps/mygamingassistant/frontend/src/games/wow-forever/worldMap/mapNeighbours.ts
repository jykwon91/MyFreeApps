/**
 * The zones that really share a land border with the viewed map, and where
 * on the map's frame to name them ("Westfall ←").
 *
 * A zone map's picture is a rectangle, so it also shows land of zones that
 * never touch the viewed one (Stranglethorn's picture reaches across to the
 * Swamp of Sorrows). Sampling past the picture's edges named those; instead
 * we walk the viewed zone's own outline (its mask) and probe outward from
 * every border cell: a sibling zone whose outline is met first is a
 * neighbour, and the border cells it touches say where it is.
 */
import { MAP_KIND, type MapView, type WorldMapData, type WorldPoint } from "@/games/wow-forever/types/worldMap";
import { mapToWorld } from "@/games/wow-forever/worldMap/mapGeometry";
import { childrenOf, covers, isZoneView } from "@/games/wow-forever/worldMap/mapHitTest";

export const MAP_EDGE = { west: "west", east: "east", north: "north", south: "south" } as const;
export type MapEdge = (typeof MAP_EDGE)[keyof typeof MAP_EDGE];

const EDGE_ARROW: Record<MapEdge, string> = { west: "←", east: "→", north: "↑", south: "↓" };

/** A neighbouring map named at the edge of the viewed one ("Westfall ←"). */
export interface EdgeLabel {
  target: MapView;
  edge: MapEdge;
  /** Where along the edge, 0..100 (top -> bottom for west/east, left -> right for north/south). */
  along: number;
  text: string;
}

/**
 * Zone outlines (the client's highlight art) leave a gap of up to a few
 * hundred yards over the mountains between neighbours. From every border cell
 * we walk outward in eight directions, `step` yards at a time up to `reach`;
 * the first sibling outline met is a neighbour there (never one past it). A
 * shared border must be `minCells` border cells long — not a corner graze.
 */
export const CONTACT = { reach: 450, step: 25, minCells: 8 } as const;
/** Maps without an outline (cities, islands) are sampled as their full rectangle on this grid. */
const RECT_GRID = { width: 120, height: 80 } as const;
/** Points sampled along each side of a city's picture, and how far out (percent of it). */
const EDGE_SAMPLES = 50;
const CITY_RING_DEPTHS = [2, 15, 30] as const;
/** A city names each zone that holds at least this share of the ring around its picture. */
const CITY_MIN_SHARE = 0.2;
/** The picture's size in the client (1002 x 668): percent -> comparable distances. */
const PICTURE = { width: 1002, height: 668 } as const;

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

interface Point {
  x: number;
  y: number;
}

interface Outline {
  width: number;
  height: number;
  inside: (row: number, col: number) => boolean;
}

function outlineOf(data: WorldMapData, map: MapView): Outline {
  const mask = data.masks.get(map.id);
  if (!mask) {
    return { ...RECT_GRID, inside: (row, col) => row >= 0 && col >= 0 && row < RECT_GRID.height && col < RECT_GRID.width };
  }
  return {
    width: mask.width,
    height: mask.height,
    inside: (row, col) =>
      row >= 0 && col >= 0 && row < mask.height && col < mask.width && mask.bits[row * mask.width + col] === 1,
  };
}

function boundsNear(a: readonly number[], b: readonly number[], pad: number): boolean {
  return a[0] - pad <= b[1] && b[0] <= a[1] + pad && a[2] - pad <= b[3] && b[2] <= a[3] + pad;
}

function mean(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

const clampPercent = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Where the ray from `from` through `to` leaves the picture: the edge, and
 * how far along it. Aimed in picture pixels, so a diagonal looks diagonal.
 */
export function edgeToward(from: Point, to: Point): { edge: MapEdge; along: number } {
  const dx = ((to.x - from.x) * PICTURE.width) / 100;
  const dy = ((to.y - from.y) * PICTURE.height) / 100;
  const left = (from.x * PICTURE.width) / 100;
  const top = (from.y * PICTURE.height) / 100;
  const exits: { edge: MapEdge; t: number }[] = [];
  if (dx < 0) exits.push({ edge: MAP_EDGE.west, t: left / -dx });
  if (dx > 0) exits.push({ edge: MAP_EDGE.east, t: (PICTURE.width - left) / dx });
  if (dy < 0) exits.push({ edge: MAP_EDGE.north, t: top / -dy });
  if (dy > 0) exits.push({ edge: MAP_EDGE.south, t: (PICTURE.height - top) / dy });
  if (exits.length === 0) return { edge: MAP_EDGE.north, along: clampPercent(from.x) };
  const { edge, t } = exits.reduce((a, b) => (b.t < a.t ? b : a));
  const sideways = edge === MAP_EDGE.west || edge === MAP_EDGE.east;
  const along = sideways ? ((top + dy * t) / PICTURE.height) * 100 : ((left + dx * t) / PICTURE.width) * 100;
  return { edge, along: clampPercent(along) };
}

/** Points in rings around a picture (just past it, then further out), in its percent. */
function ringsOutside(): Point[] {
  const ring: Point[] = [];
  for (const depth of CITY_RING_DEPTHS) {
    for (let i = 0; i < EDGE_SAMPLES; i++) {
      const along = ((i + 0.5) / EDGE_SAMPLES) * 100;
      ring.push({ x: -depth, y: along }, { x: 100 + depth, y: along }, { x: along, y: -depth }, { x: along, y: 100 + depth });
    }
  }
  return ring;
}

/** Which side of the picture a point just outside it lies past. */
function sideOutside(p: Point): MapEdge {
  if (p.x < 0) return MAP_EDGE.west;
  if (p.x > 100) return MAP_EDGE.east;
  if (p.y < 0) return MAP_EDGE.north;
  return MAP_EDGE.south;
}

/** The middle of a map's own outline, in its percent. */
function outlineCentre(data: WorldMapData, map: MapView): Point {
  const outline = outlineOf(data, map);
  const cells: Point[] = [];
  for (let row = 0; row < outline.height; row++) {
    for (let col = 0; col < outline.width; col++) {
      if (outline.inside(row, col)) cells.push({ x: ((col + 0.5) / outline.width) * 100, y: ((row + 0.5) / outline.height) * 100 });
    }
  }
  return cells.length > 0 ? mean(cells) : { x: 50, y: 50 };
}

/**
 * A city ships no outline — its picture is a box inside its zone — so its
 * neighbours are the zones around that box, each where most of it lies.
 */
function cityExits(data: WorldMapData, city: MapView, siblings: readonly MapView[]): Map<MapView, Point[]> {
  const ring = ringsOutside();
  const byZone = new Map<MapView, Point[]>();
  for (const p of ring) {
    const world = mapToWorld(city, p.x, p.y);
    const around = world && siblings.find((m) => covers(data, m, world));
    if (around) byZone.set(around, [...(byZone.get(around) ?? []), p]);
  }
  const found = new Map<MapView, Point[]>();
  const most = Math.max(0, ...[...byZone.values()].map((points) => points.length));
  for (const [zone, points] of byZone) {
    if (points.length < most && points.length < ring.length * CITY_MIN_SHARE) continue;
    const bySide = new Map<MapEdge, Point[]>();
    for (const p of points) {
      const side = sideOutside(p);
      bySide.set(side, [...(bySide.get(side) ?? []), p]);
    }
    found.set(zone, [...bySide.values()].reduce((a, b) => (b.length > a.length ? b : a)));
  }
  return found;
}

/**
 * The zones the viewed zone or city borders, each with the border cells (in
 * the viewed map's percent) where it touches. Cities are never neighbours of
 * a zone: they sit inside it, clickable on the picture itself.
 */
export function landBorders(data: WorldMapData, viewedId: number): Map<MapView, Point[]> {
  const viewed = data.maps.get(viewedId);
  const zone = viewed?.zone;
  const found = new Map<MapView, Point[]>();
  if (!viewed || !zone || !isZoneView(viewed) || viewed.parent === null) return found;
  const { reach, step, minCells } = CONTACT;
  const siblings = childrenOf(data, viewed.parent).filter(
    (m) => m !== viewed && m.kind !== MAP_KIND.city && m.zone?.continent === zone.continent && boundsNear(m.zone.bounds, zone.bounds, reach),
  );
  if (siblings.length === 0) return found;
  if (viewed.kind === MAP_KIND.city) return cityExits(data, viewed, siblings);

  const [minX, maxX, minY, maxY] = zone.bounds;
  const outline = outlineOf(data, viewed);
  for (let row = 0; row < outline.height; row++) {
    for (let col = 0; col < outline.width; col++) {
      if (!outline.inside(row, col)) continue;
      const interior =
        outline.inside(row - 1, col) && outline.inside(row + 1, col) && outline.inside(row, col - 1) && outline.inside(row, col + 1);
      if (interior) continue;
      const x = ((col + 0.5) / outline.width) * 100;
      const y = ((row + 0.5) / outline.height) * 100;
      const wx = maxX - (y / 100) * (maxX - minX);
      const wy = maxY - (x / 100) * (maxY - minY);
      const touched = new Set<MapView>();
      for (const [dx, dy] of DIRECTIONS) {
        for (let yards = step; yards <= reach; yards += step) {
          // Map x runs toward -Y (east), map y toward -X (south).
          const probe: WorldPoint = { continent: zone.continent, wx: wx - dy * yards, wy: wy - dx * yards };
          if (covers(data, viewed, probe)) continue;
          const hit = siblings.find((sibling) => covers(data, sibling, probe));
          if (hit) {
            touched.add(hit);
            break;
          }
        }
      }
      for (const sibling of touched) found.set(sibling, [...(found.get(sibling) ?? []), { x, y }]);
    }
  }
  for (const [sibling, cells] of found) if (cells.length < minCells) found.delete(sibling);
  return found;
}

/**
 * The zones across the viewed map's land borders, each named where the line
 * from the zone's middle through that border leaves the frame — the side it
 * lies past, at the point along it where it is.
 */
export function neighbourLabels(data: WorldMapData, viewedId: number): EdgeLabel[] {
  const viewed = data.maps.get(viewedId);
  const borders = landBorders(data, viewedId);
  if (!viewed || borders.size === 0) return [];
  const centre = outlineCentre(data, viewed);
  const labels: EdgeLabel[] = [];
  for (const [target, cells] of borders) {
    const { edge, along } = edgeToward(centre, mean(cells));
    labels.push({ target, edge, along, text: `${target.name} ${EDGE_ARROW[edge]}` });
  }
  return labels.sort((a, b) => a.target.name.localeCompare(b.target.name));
}
