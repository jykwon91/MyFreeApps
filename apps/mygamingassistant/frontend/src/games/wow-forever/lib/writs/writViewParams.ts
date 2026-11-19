import {
  WRIT_DEALS_ON,
  WRIT_DEALS_PARAM,
  WRIT_DIRECTION_PARAM,
  WRIT_LOCATION_PARAM,
  WRIT_SORT_PARAM,
  WRIT_TIER_PARAM,
} from "@/games/wow-forever/data/professions/writs/writParams";
import { DEFAULT_WRIT_SORT, WRIT_SORT_KEYS } from "@/games/wow-forever/data/professions/writs/writSortOptions";
import { WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
import type { WritView } from "@/games/wow-forever/types/writs/writView";

/** The page's filters and order from its link. Every value is checked against an allowlist; anything else reads as "not set". */
export function writViewFromParams(params: URLSearchParams, knownLocations: readonly string[]): WritView {
  const tier = WRIT_TIERS.find((t) => t === params.get(WRIT_TIER_PARAM)) ?? null;
  const location = knownLocations.find((l) => l === params.get(WRIT_LOCATION_PARAM)) ?? null;
  const key = WRIT_SORT_KEYS.find((k) => k === params.get(WRIT_SORT_PARAM)) ?? DEFAULT_WRIT_SORT.key;
  const direction = params.get(WRIT_DIRECTION_PARAM) === "desc" ? "desc" : DEFAULT_WRIT_SORT.direction;
  return { filters: { tier, location, dealsOnly: params.get(WRIT_DEALS_PARAM) === WRIT_DEALS_ON }, sort: { key, direction } };
}

function setOrDelete(params: URLSearchParams, name: string, value: string | null): void {
  if (value === null) params.delete(name);
  else params.set(name, value);
}

/** Writes the view into `params`, leaving out every default. Params that aren't the view's (the house) stay as they are. */
export function writViewToParams(params: URLSearchParams, view: WritView): URLSearchParams {
  setOrDelete(params, WRIT_TIER_PARAM, view.filters.tier);
  setOrDelete(params, WRIT_LOCATION_PARAM, view.filters.location);
  setOrDelete(params, WRIT_DEALS_PARAM, view.filters.dealsOnly ? WRIT_DEALS_ON : null);
  setOrDelete(params, WRIT_SORT_PARAM, view.sort.key === DEFAULT_WRIT_SORT.key ? null : view.sort.key);
  setOrDelete(params, WRIT_DIRECTION_PARAM, view.sort.direction === DEFAULT_WRIT_SORT.direction ? null : view.sort.direction);
  return params;
}
