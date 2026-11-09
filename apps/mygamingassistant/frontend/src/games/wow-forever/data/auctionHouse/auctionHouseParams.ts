/** The Auction house page's search, in `?q=` so a lookup can be shared (and linked from Ask). */
export const AUCTION_QUERY_PARAM = "q";

/**
 * `?house=alliance|horde|neutral` — whose auction house to show. Left out = the
 * player's saved faction; Blackwater (`neutral`) is only ever chosen this way,
 * since nobody's faction is neutral.
 */
export const AUCTION_HOUSE_PARAM = "house";
