import { MIN_ZONE_SPAWNS, ZONE_LEVEL_SLACK, ZONES_SHOWN } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { isHostileGround } from "@/games/wow-forever/food/recipeSources";
import { gatherNow } from "@/games/wow-forever/gathering/gatherNow";
import { nodeColor } from "@/games/wow-forever/gathering/nodeColors";
import type { GatheringZone } from "@/games/wow-forever/types/gathering/gatheringZone";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import { SKILL_COLOR } from "@/games/wow-forever/types/gathering/skillColor";
import type { PlayerFaction, WorldZone } from "@/games/wow-forever/types/worldMap";

export interface ZoneRankInput {
  nodes: readonly ResolvedNode[];
  skill: number | null;
  faction: PlayerFaction;
  /** Your level; null = not set (zones then rank by spawns only). */
  level: number | null;
  zoneById: ReadonlyMap<number, WorldZone>;
}

/**
 * The nodes to go to: the common ones worth skill now (rare ones only when
 * nothing common is), else — past every node's yellow — the highest you can gather.
 */
function targetNodes(nodes: readonly ResolvedNode[], skill: number | null): ResolvedNode[] {
  const worth = gatherNow(nodes, skill).now.map((n) => n.resolved);
  const common = worth.filter((n) => !n.node.rare);
  if (common.length) return common;
  if (worth.length) return worth;
  const gatherable = nodes.filter((n) => skill !== null && nodeColor(n.thresholds, skill) !== SKILL_COLOR.red && !n.node.rare);
  return gatherable.slice(-1);
}

/** How far your level is outside the zone's range (0 inside it). */
function levelGap(levels: readonly [number, number], level: number): number {
  return Math.max(0, levels[0] - level, level - levels[1]);
}

function compareZones(level: number | null) {
  return (a: GatheringZone, b: GatheringZone): number => {
    if (a.aboveYou !== b.aboveYou) return Number(a.aboveYou) - Number(b.aboveYou);
    if (level !== null && a.levels && b.levels) {
      const byGap = levelGap(a.levels, level) - levelGap(b.levels, level);
      if (byGap) return byGap;
    }
    return b.count - a.count;
  };
}

/**
 * Two or three zones to gather in for your faction, skill and level. The
 * other faction's ground is left out; zones whose mobs are above you are
 * kept but listed last; the rest go by how well the zone's Forever level
 * range fits you, then by Classic spawn count.
 */
export function rankZones({ nodes, skill, faction, level, zoneById }: ZoneRankInput): GatheringZone[] {
  const zones = new Map<number, GatheringZone>();
  for (const resolved of targetNodes(nodes, skill)) {
    for (const o of resolved.spots) {
      if (o.count < MIN_ZONE_SPAWNS || isHostileGround(o.spot, faction)) continue;
      const known = zones.get(o.spot.zoneId);
      if (known) {
        known.nodes = [...known.nodes, resolved.node.name];
        if (o.count > known.count) Object.assign(known, { count: o.count, spot: o.spot });
        continue;
      }
      const levels = zoneById.get(o.spot.zoneId)?.levels ?? null;
      zones.set(o.spot.zoneId, {
        zoneId: o.spot.zoneId,
        zoneName: o.spot.zoneName,
        count: o.count,
        nodes: [resolved.node.name],
        spot: o.spot,
        levels,
        aboveYou: level !== null && levels !== null && levels[0] > level + ZONE_LEVEL_SLACK,
      });
    }
  }
  return [...zones.values()].sort(compareZones(level)).slice(0, ZONES_SHOWN);
}
