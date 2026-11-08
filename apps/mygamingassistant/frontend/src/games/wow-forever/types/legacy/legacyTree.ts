import type { LegacyEdge } from "@/games/wow-forever/types/legacy/legacyEdge";
import type { LegacyNode } from "@/games/wow-forever/types/legacy/legacyNode";

/** One of the three Legacy trees, its nodes in file order (the share link's order). */
export interface LegacyTree {
  id: number;
  name: string;
  nodes: readonly LegacyNode[];
  edges: readonly LegacyEdge[];
}
