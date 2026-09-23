/**
 * Nearest-first ranking of map POIs for where the player stands.
 *
 * Three groups, in order:
 *   1. same area — the player's zone, counting a capital city and the zone
 *      it sits in as one area (Stormwind is walkable from Goldshire);
 *   2. elsewhere on the same continent;
 *   3. another continent — a boat or zeppelin is needed.
 * Within groups 2 and 3 a capital city wins over a slightly closer village:
 * capitals have every service in one place and a flight path.
 */
import type { MapPoi, PlayerFaction, WorldMapData, WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { yardsBetween, zoneShows, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";

export const NEAR_GROUP = {
  sameArea: "sameArea",
  sameContinent: "sameContinent",
  otherContinent: "otherContinent",
} as const;
export type NearGroup = (typeof NEAR_GROUP)[keyof typeof NEAR_GROUP];

const GROUP_ORDER: Readonly<Record<NearGroup, number>> = { sameArea: 0, sameContinent: 1, otherContinent: 2 };

/** A capital counts as this much closer than it is (1.5 = 3,000 yd beats a 2,000 yd village). */
export const CAPITAL_PREFERENCE = 1.5;

export interface RankedPoi {
  poi: MapPoi;
  zone: WorldZone;
  world: WorldPoint;
  group: NearGroup;
  /** Straight-line yards; null on another continent. */
  yards: number | null;
}

export interface PlayerLocation {
  zone: WorldZone;
  world: WorldPoint;
}

/** The zone a capital city sits inside (Stormwind -> Elwynn Forest). */
export function parentZoneOf(city: WorldZone, zones: readonly WorldZone[]): WorldZone | undefined {
  if (city.kind !== "city") return undefined;
  const [minX, maxX, minY, maxY] = city.bounds;
  const centre: WorldPoint = { continent: city.continent, wx: (minX + maxX) / 2, wy: (minY + maxY) / 2 };
  // Zone rectangles overlap at their edges — the city sits deepest in its parent.
  let best: WorldZone | undefined;
  let bestDepth = -1;
  for (const z of zones) {
    if (z.kind !== "zone" || z.foreverOnly || !zoneShows(z, centre)) continue;
    const depth = rectDepth(z, centre);
    if (depth > bestDepth) {
      best = z;
      bestDepth = depth;
    }
  }
  return best;
}

/** How deep inside the zone rectangle a point is: 0 at the edge, 0.5 at the centre. */
function rectDepth(zone: WorldZone, p: WorldPoint): number {
  const [minX, maxX, minY, maxY] = zone.bounds;
  const fx = (p.wx - minX) / (maxX - minX);
  const fy = (p.wy - minY) / (maxY - minY);
  return Math.min(fx, 1 - fx, fy, 1 - fy);
}

/** Zone ids that count as "the same area" as `zone`. */
export function sameAreaZoneIds(zone: WorldZone, zones: readonly WorldZone[]): ReadonlySet<number> {
  const ids = new Set<number>([zone.id]);
  const parent = parentZoneOf(zone, zones);
  if (parent) ids.add(parent.id);
  for (const z of zones) {
    if (parentZoneOf(z, zones)?.id === zone.id) ids.add(z.id);
  }
  return ids;
}

export function isCapital(zone: WorldZone): boolean {
  return zone.kind === "city";
}

/** The player can use the NPC: own faction or neutral, unless they asked to see the other faction too. */
export function usableBy(poi: MapPoi, faction: PlayerFaction, includeOtherFaction: boolean): boolean {
  return includeOtherFaction || poi.faction === faction || poi.faction === FACTION.neutral;
}

export function locatePoi(poi: MapPoi, data: WorldMapData): { zone: WorldZone; world: WorldPoint } | null {
  const zone = data.zoneById.get(poi.zone);
  if (!zone) return null;
  return { zone, world: zoneToWorld(zone, poi.x, poi.y) };
}

function sortKey(r: RankedPoi): number {
  if (r.yards === null) return isCapital(r.zone) ? 0 : 1;
  if (r.group === NEAR_GROUP.sameArea) return r.yards;
  return isCapital(r.zone) ? r.yards / CAPITAL_PREFERENCE : r.yards;
}

export function rankPois(
  pois: readonly MapPoi[],
  player: PlayerLocation,
  data: WorldMapData,
): RankedPoi[] {
  const area = sameAreaZoneIds(player.zone, data.zones);
  const ranked: RankedPoi[] = [];
  for (const poi of pois) {
    const located = locatePoi(poi, data);
    if (!located) continue;
    const sameContinent = located.world.continent === player.world.continent;
    let group: NearGroup = NEAR_GROUP.otherContinent;
    if (sameContinent) group = area.has(poi.zone) ? NEAR_GROUP.sameArea : NEAR_GROUP.sameContinent;
    ranked.push({
      poi,
      zone: located.zone,
      world: located.world,
      group,
      yards: sameContinent ? yardsBetween(player.world, located.world) : null,
    });
  }
  return ranked.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      sortKey(a) - sortKey(b) ||
      a.poi.name.localeCompare(b.poi.name),
  );
}
