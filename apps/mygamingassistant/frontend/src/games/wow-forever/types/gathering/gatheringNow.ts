import type { ColoredNode } from "@/games/wow-forever/types/gathering/coloredNode";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";

/** "What can I gather right now?": the orange / yellow nodes at your skill, and the next common one to unlock. */
export interface GatheringNow {
  now: readonly ColoredNode[];
  next: ResolvedNode | null;
}
