import { WALK_GRAPH_MAPS, loadWalkGraph } from "@/games/wow-forever/hooks/useWalkGraphs";
import type { WalkGraphs } from "@/games/wow-forever/worldMap/directions";
import type { WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";

/**
 * The walk graphs a planned route may need, shared with the World Map's cache.
 * A graph that won't load is left out: its walks fall back to straight lines,
 * as the World Map's do, rather than failing the answer.
 */
export async function loadAskWalkGraphs(continents: readonly number[]): Promise<WalkGraphs> {
  const wanted = [...new Set(continents)].filter((id) => WALK_GRAPH_MAPS.has(id));
  const settled = await Promise.allSettled(wanted.map(loadWalkGraph));
  const graphs = new Map<number, WalkGraph>();
  for (const result of settled) {
    if (result.status === "fulfilled") graphs.set(result.value.mapId, result.value);
  }
  return graphs;
}
