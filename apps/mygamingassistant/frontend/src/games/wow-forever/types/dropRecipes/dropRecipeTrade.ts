/** Whether the recipe item can be bought (it trades, so the Auction House may have it) or binds when picked up. */
export const DROP_RECIPE_TRADE = {
  auctionHouse: "ah",
  bindOnPickup: "bop",
} as const;

export type DropRecipeTrade = (typeof DROP_RECIPE_TRADE)[keyof typeof DROP_RECIPE_TRADE];
