import type { CrateFilters } from "@/games/wow-forever/types/crates/crateFilters";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";

/** Everything the crates page keeps in its link. */
export interface CrateView {
  filters: CrateFilters;
  sort: CrateSort;
}
