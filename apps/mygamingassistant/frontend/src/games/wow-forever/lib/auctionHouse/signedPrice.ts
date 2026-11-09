import { formatPrice } from "@/games/wow-forever/crafting/matPrices";

/** "+1g 20s" / "−45s" / "0c": a gain or a loss in copper. */
export function signedPrice(copper: number): string {
  if (copper === 0) return formatPrice(0);
  return `${copper > 0 ? "+" : "−"}${formatPrice(Math.abs(copper))}`;
}
