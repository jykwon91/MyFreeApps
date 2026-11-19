import { WRIT_DEALS_ON, WRIT_DEALS_PARAM, WRIT_LOCATION_PARAM } from "@/games/wow-forever/data/professions/writs/writParams";
import { DEFAULT_WRIT_SORT, WRIT_SORT_KEYS } from "@/games/wow-forever/data/professions/writs/writSortOptions";
import { WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
import { setOrDeleteParam, sortFromParams, sortToParams, tierFromParams, tierToParams } from "@/games/wow-forever/lib/professionTiers/viewParams";
import type { WritView } from "@/games/wow-forever/types/writs/writView";

/** The page's filters and order from its link. Every value is checked against an allowlist; anything else reads as "not set". */
export function writViewFromParams(params: URLSearchParams, knownLocations: readonly string[]): WritView {
  const location = knownLocations.find((l) => l === params.get(WRIT_LOCATION_PARAM)) ?? null;
  return {
    filters: { tier: tierFromParams(params, WRIT_TIERS), location, dealsOnly: params.get(WRIT_DEALS_PARAM) === WRIT_DEALS_ON },
    sort: sortFromParams(params, WRIT_SORT_KEYS, DEFAULT_WRIT_SORT),
  };
}

/** Writes the view into `params`, leaving out every default. Params that aren't the view's (the house) stay as they are. */
export function writViewToParams(params: URLSearchParams, view: WritView): URLSearchParams {
  tierToParams(params, view.filters.tier);
  setOrDeleteParam(params, WRIT_LOCATION_PARAM, view.filters.location);
  setOrDeleteParam(params, WRIT_DEALS_PARAM, view.filters.dealsOnly ? WRIT_DEALS_ON : null);
  sortToParams(params, view.sort, DEFAULT_WRIT_SORT);
  return params;
}
