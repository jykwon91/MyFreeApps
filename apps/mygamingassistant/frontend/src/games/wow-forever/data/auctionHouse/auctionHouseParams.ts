/** The Auction house page's search, in `?q=` so a lookup can be shared (and linked from Ask). */
export const AUCTION_QUERY_PARAM = "q";

/**
 * `?house=alliance|horde|neutral` — whose auction house to show. Left out = the
 * player's saved faction; Blackwater (`neutral`) is only ever chosen this way,
 * since nobody's faction is neutral.
 */
export const AUCTION_HOUSE_PARAM = "house";

/** `?prof=<crafting profession>` — show only the materials that profession's recipes use. */
export const AUCTION_PROFESSION_PARAM = "prof";

/** `?recipe=<spell id>` — one recipe of `?prof`: its materials' prices and what it sells for. */
export const AUCTION_RECIPE_PARAM = "recipe";
