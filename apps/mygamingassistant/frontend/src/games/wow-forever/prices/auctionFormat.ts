import { formatPrice } from "@/games/wow-forever/crafting/matPrices";

/** What a missing figure shows. */
export const NO_FIGURE = "—";

/** Exact copper as "1g 20s 5c"; a missing figure is a dash. */
export function priceOrDash(copper: number | null): string {
  return copper === null ? NO_FIGURE : formatPrice(copper);
}

/** Under this many sales a day, one decimal still says something ("0.4"). */
const WHOLE_SALES_FROM = 10;

/** "20,239", "12" or "0.4" sales a day; a missing figure is a dash. */
export function soldPerDayText(sold: number | null): string {
  if (sold === null) return NO_FIGURE;
  const digits = sold < WHOLE_SALES_FROM ? 1 : 0;
  return sold.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function itemLabel(name: string, itemId: number): string {
  return name || `Item ${itemId}`;
}
