import { DEFAULT_NODE_OFFSETS } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import type { NodeColorOffsets } from "@/games/wow-forever/types/gathering/nodeColorOffsets";
import type { NodeThresholds } from "@/games/wow-forever/types/gathering/nodeThresholds";
import { SKILL_COLOR, type SkillColor } from "@/games/wow-forever/types/gathering/skillColor";

/** Where a node needing `orange` skill changes colour. */
export function nodeThresholds(orange: number, offsets: NodeColorOffsets = DEFAULT_NODE_OFFSETS): NodeThresholds {
  return { orange, yellow: orange + offsets.yellow, green: orange + offsets.green, grey: orange + offsets.grey };
}

/** The node's colour at `skill`: red below the required skill, grey once it gives no more points. */
export function nodeColor(t: NodeThresholds, skill: number): SkillColor {
  if (skill < t.orange) return SKILL_COLOR.red;
  if (skill < t.yellow) return SKILL_COLOR.orange;
  if (skill < t.green) return SKILL_COLOR.yellow;
  if (skill < t.grey) return SKILL_COLOR.green;
  return SKILL_COLOR.grey;
}

/** Orange or yellow — a node worth gathering for skill. */
export function isWorthSkill(color: SkillColor): boolean {
  return color === SKILL_COLOR.orange || color === SKILL_COLOR.yellow;
}
