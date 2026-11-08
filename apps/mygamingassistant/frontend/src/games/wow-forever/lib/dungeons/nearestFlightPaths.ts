import type { DungeonFlightPath } from "@/games/wow-forever/types/dungeons/dungeonFlightPath";
import { FACTION, type FlightNode, type PlayerFaction, type WorldPoint } from "@/games/wow-forever/types/worldMap";
import { yardsBetween } from "@/games/wow-forever/worldMap/geometry";

const PLAYER_FACTIONS: readonly PlayerFaction[] = [FACTION.alliance, FACTION.horde];

/**
 * For each faction, the flight master it can use (its own or a neutral one) nearest
 * `door` in a straight line. A faction with none on the door's continent is left out.
 */
export function nearestFlightPaths(door: WorldPoint, nodes: readonly FlightNode[]): DungeonFlightPath[] {
  const out: DungeonFlightPath[] = [];
  for (const faction of PLAYER_FACTIONS) {
    let best: DungeonFlightPath | null = null;
    for (const node of nodes) {
      if (node.faction !== faction && node.faction !== FACTION.neutral) continue;
      const yards = yardsBetween(door, node.world);
      if (Number.isFinite(yards) && (!best || yards < best.yards)) best = { faction, name: node.name, yards };
    }
    if (best) out.push(best);
  }
  return out;
}
