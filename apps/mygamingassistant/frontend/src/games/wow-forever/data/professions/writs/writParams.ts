/** `?tier=journeyman|expert|artisan` — one tier only. */
export const WRIT_TIER_PARAM = "tier";

/** `?loc=<zone>` or `?loc=unknown` (no recorded turn-in) — one turn-in location only. */
export const WRIT_LOCATION_PARAM = "loc";

/** `?deals=1` — only the deals. */
export const WRIT_DEALS_PARAM = "deals";
export const WRIT_DEALS_ON = "1";

/** `?sort=name|tier|writPrice|itemPrice` — left out = by total. `?dir=desc` reverses it. */
export const WRIT_SORT_PARAM = "sort";
export const WRIT_DIRECTION_PARAM = "dir";

/** The `?loc=` value for writs nobody has seen handed in yet. */
export const WRIT_LOCATION_UNKNOWN = "unknown";
