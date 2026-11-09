import { formatPrice } from "@/games/wow-forever/crafting/matPrices";

/** What a missing figure shows. */
export const NO_FIGURE = "—";

/** Exact copper as "1g 20s 5c"; a missing figure is a dash. */
export function priceOrDash(copper: number | null): string {
  return copper === null ? NO_FIGURE : formatPrice(copper);
}

/** "23,980 in 910 auctions", "1 in 1 auction". */
export function onSaleText(quantity: number, listings: number): string {
  const auctions = listings === 1 ? "auction" : "auctions";
  return `${quantity.toLocaleString("en-US")} in ${listings.toLocaleString("en-US")} ${auctions}`;
}

export function itemLabel(name: string, itemId: number): string {
  return name || `Item ${itemId}`;
}
