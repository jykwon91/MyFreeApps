import { nodeThresholds } from "@/games/wow-forever/gathering/nodeColors";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

/**
 * Join each guide node to its spawns. Its required skill is the Forever
 * client's Lock skill on those spawns — a node with none throws, so a
 * regenerated file that lost a node fails loudly instead of showing skill 0.
 */
export function resolveNodes(nodes: readonly GatheringNode[], sources: (itemId: number) => ItemSources): ResolvedNode[] {
  return nodes.map((node) => {
    const spots = sources(node.itemId)
      .objectSpots.filter((o) => o.name === node.node)
      .sort((a, b) => b.count - a.count);
    const level = spots.find((o) => o.gather)?.gather?.level;
    if (level === undefined) throw new Error(`Gathering data: no spawns with a gathering skill for ${node.node}`);
    return { node, thresholds: nodeThresholds(level, node.offsets), spots };
  });
}
