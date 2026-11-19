/** `?tier=<tier>` — one tier only. */
export const PROFESSION_TIER_PARAM = "tier";

/** `?sort=<key>` — left out = the page's default column. `?dir=desc` reverses it. */
export const PROFESSION_SORT_PARAM = "sort";
export const PROFESSION_DIRECTION_PARAM = "dir";

/** `?q=<text>` — the search box; left out when empty. */
export const PROFESSION_SEARCH_PARAM = "q";
/** How long typing must pause before the search is written to the link. */
export const PROFESSION_SEARCH_DEBOUNCE_MS = 250;
export const PROFESSION_SEARCH_MAX_LENGTH = 60;
