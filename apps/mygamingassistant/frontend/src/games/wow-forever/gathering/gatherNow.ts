import { UNTRAINED_SKILL } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { isWorthSkill, nodeColor } from "@/games/wow-forever/gathering/nodeColors";
import type { GatheringNow } from "@/games/wow-forever/types/gathering/gatheringNow";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";

/**
 * What's worth gathering at `skill` (orange or yellow, lowest first) and the
 * next common node it unlocks — rare ones (Silver) never count as the next goal.
 */
export function gatherNow(nodes: readonly ResolvedNode[], skill: number | null): GatheringNow {
  const at = skill ?? UNTRAINED_SKILL;
  const now = nodes
    .map((resolved) => ({ resolved, color: nodeColor(resolved.thresholds, at) }))
    .filter((n) => isWorthSkill(n.color));
  const next = nodes.find((n) => !n.node.rare && n.thresholds.orange > at) ?? null;
  return { now, next };
}
