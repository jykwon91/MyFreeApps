import type { AskGuideRow } from "@/games/wow-forever/types/ask/askGuideRow";

/** `professionRouteRows`: the next rows of a route from a skill. */
export interface AskRouteRows {
  rows: AskGuideRow[];
  /** Rows after the shown ones. */
  more: number;
  /** The skill is past the route's last row. */
  done: boolean;
}
