/** Words the guide tools put in the results Claude reads. */
export const ASK_TOOL_NOTE = {
  levelNotSet: "the player's level isn't set; ask for it",
  fromMessage: "player's message",
  savedLevel: "saved level",
  savedLocation: "saved location",
  vendorPrices: "vendor prices, not auction prices",
  pastRoute: "the skill is past the end of the site's route",
  start: "start",
  macrosFallback: "nothing matched the search; these are the class's macros",
  pricesSource: "Blizzard's live auction listings: market_value = what the cheapest tenth of the units on sale cost; cheapest = the single lowest listing",
  pricesOld: "these prices are more than 12 hours old; say they may be out of date",
  pricesNone: "no auction prices for this auction house yet; don't guess a price",
  pricesFailed: "the auction prices didn't load; say so and don't guess a price",
  noPriceMatch: "nobody is selling that on this auction house right now; don't guess a price",
  updatedUnknown: "unknown",
  statusFailed: "couldn't reach Blizzard's status page; say so and don't say the servers are up or down",
  statusNone: "Blizzard's status listed no Forever servers for this region",
} as const;
