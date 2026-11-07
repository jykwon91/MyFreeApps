import { HERBALISM_NODES } from "@/games/wow-forever/data/professions/gathering/herbalism";
import { MINING_NODES } from "@/games/wow-forever/data/professions/gathering/mining";
import type { GatheringMapSpot } from "@/games/wow-forever/types/mapLayers/gatheringMapSpot";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";
import { GATHER_SKILL, type GatherSkill, type ItemSources } from "@/games/wow-forever/types/recipeSources";

function spotsOf(nodes: readonly GatheringNode[], skill: GatherSkill, sources: (itemId: number) => ItemSources): GatheringMapSpot[] {
  return nodes.flatMap((node) =>
    sources(node.itemId).objectSpots.flatMap((o): GatheringMapSpot[] =>
      o.name === node.node && o.gather?.skill === skill
        ? [
            {
              id: `gather:${skill}:${node.node}:${o.spot.zoneId}`,
              skill,
              name: node.node,
              count: o.count,
              level: o.gather.level,
              zoneId: o.spot.zoneId,
              subzone: o.spot.subzone,
              x: o.spot.x,
              y: o.spot.y,
            },
          ]
        : [],
    ),
  );
}

/** The herb and ore sample spots the gathering guides use: one per node type per zone, with its spawn count and skill. */
export function gatheringMapSpots(sources: (itemId: number) => ItemSources): GatheringMapSpot[] {
  return [...spotsOf(HERBALISM_NODES, GATHER_SKILL.herbalism, sources), ...spotsOf(MINING_NODES, GATHER_SKILL.mining, sources)];
}
