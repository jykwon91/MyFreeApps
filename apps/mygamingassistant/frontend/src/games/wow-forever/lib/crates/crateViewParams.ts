import { CRATE_SORT_KEYS, DEFAULT_CRATE_SORT } from "@/games/wow-forever/data/professions/crates/crateSortOptions";
import { CRATE_TIERS } from "@/games/wow-forever/data/professions/crates/crateTiers";
import { sortFromParams, sortToParams, tierFromParams, tierToParams } from "@/games/wow-forever/lib/professionTiers/viewParams";
import type { CrateView } from "@/games/wow-forever/types/crates/crateView";

/** The page's filter and order from its link. Every value is checked against an allowlist; anything else reads as "not set". */
export function crateViewFromParams(params: URLSearchParams): CrateView {
  return {
    filters: { tier: tierFromParams(params, CRATE_TIERS) },
    sort: sortFromParams(params, CRATE_SORT_KEYS, DEFAULT_CRATE_SORT),
  };
}

/** Writes the view into `params`, leaving out every default. Params that aren't the view's (the house) stay as they are. */
export function crateViewToParams(params: URLSearchParams, view: CrateView): URLSearchParams {
  tierToParams(params, view.filters.tier);
  sortToParams(params, view.sort, DEFAULT_CRATE_SORT);
  return params;
}
