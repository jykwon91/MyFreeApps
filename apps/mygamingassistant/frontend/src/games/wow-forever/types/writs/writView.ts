import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";

/** Everything the writs page keeps in its link. */
export interface WritView {
  filters: WritFilters;
  sort: WritSort;
}
