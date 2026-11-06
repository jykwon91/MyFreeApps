import type { BoardStatusFilter } from "@/games/wow-forever/types/featureRequests/boardStatusFilter";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureSort } from "@/games/wow-forever/types/featureRequests/featureSort";

/** The board's URL state (`?status=&area=&sort=&r=`). */
export interface BoardFilters {
  status: BoardStatusFilter;
  area: FeatureArea | null;
  sort: FeatureSort;
  /** A story to scroll to and highlight. */
  highlight: string | null;
}
