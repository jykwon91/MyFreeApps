import { formatPrice } from "@/games/wow-forever/crafting/matPrices";

/** What a missing figure shows. */
export const NO_FIGURE = "—";

/** Exact copper as "1g 20s 5c"; a missing figure is a dash. */
export function priceOrDash(copper: number | null): string {
  return copper === null ? NO_FIGURE : formatPrice(copper);
}

/** "12" or "0.4" sales a day; a missing figure is a dash. */
export function soldPerDayText(sold: number | null): string {
  return sold === null ? NO_FIGURE : String(Math.round(sold * 10) / 10);
}

export function itemLabel(name: string, itemId: number): string {
  return name || `Item ${itemId}`;
}
