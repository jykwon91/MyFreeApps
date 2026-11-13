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

/** `?sort=supply|listings|high|low|gap|quality|name` — left out = most on sale. */
export const AUCTION_SORT_PARAM = "sort";

/** `?quality=rare,epic` — only these qualities (`unknown` = items with no icon entry). */
export const AUCTION_QUALITY_PARAM = "quality";

/** `?min=` / `?max=` — market value range, in gold. */
export const AUCTION_MIN_GOLD_PARAM = "min";
export const AUCTION_MAX_GOLD_PARAM = "max";

/** `?qty=10` — at least this many units on sale. */
export const AUCTION_QUANTITY_PARAM = "qty";

/** `?listings=5` — at least this many auctions. */
export const AUCTION_LISTINGS_PARAM = "listings";

/** `?slot=head` and `?type=Plate` — gear only. */
export const AUCTION_SLOT_PARAM = "slot";
export const AUCTION_TYPE_PARAM = "type";

/** `?lvl=20-40` (either end may be left empty) — gear's required level. */
export const AUCTION_LEVEL_PARAM = "lvl";

/** `?usable=1` — gear the player's class can equip. */
export const AUCTION_USABLE_PARAM = "usable";

/** Every param that is a filter (not the search, sort, house or profession): "Clear all" removes these. */
export const AUCTION_FILTER_PARAMS: readonly string[] = [
  AUCTION_QUALITY_PARAM,
  AUCTION_MIN_GOLD_PARAM,
  AUCTION_MAX_GOLD_PARAM,
  AUCTION_QUANTITY_PARAM,
  AUCTION_LISTINGS_PARAM,
  AUCTION_SLOT_PARAM,
  AUCTION_TYPE_PARAM,
  AUCTION_LEVEL_PARAM,
  AUCTION_USABLE_PARAM,
];
