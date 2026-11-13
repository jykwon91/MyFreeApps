/**
 * How the auction-house lookup orders items. `supply` = most units on sale first,
 * `listings` = most auctions first, `gap` = market value furthest above the cheapest
 * listing first, `quality` = the rarest items first.
 */
export type AuctionSort = "supply" | "listings" | "high" | "low" | "gap" | "quality" | "name";
