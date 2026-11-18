import type { StatKey } from "@/games/wow-forever/data/statKeys";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** One guild member's item scorer, and what one point of their best main stat scores. */
export interface MemberScorer {
  score: (item: ClientItem) => number;
  point: number;
  stat: StatKey;
}
