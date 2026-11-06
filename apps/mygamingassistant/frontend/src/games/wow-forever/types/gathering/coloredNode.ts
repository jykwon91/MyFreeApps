import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import type { SkillColor } from "@/games/wow-forever/types/gathering/skillColor";

/** A node and its colour at your skill. */
export interface ColoredNode {
  resolved: ResolvedNode;
  color: SkillColor;
}
