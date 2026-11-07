import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";

/** Shown under a material's price field when nothing fills it in. */
export const NOT_SOLD_YET = "Not on the auction house yet — fills in automatically once it sells";

/** Where a filled-in price came from: "Auction house", "From its materials", "From Lesser Astral Essence". */
export function autoPriceSource(auto: AutoPrice, names: ReadonlyMap<number, string>): string {
  if (auto.from === "auction") return "Auction house";
  if (auto.from === "materials") return "From its materials";
  const partner = names.get(auto.partner);
  if (!partner) return "From the other half of its essence pair";
  return `From ${partner}`;
}

/** The button that drops your price: "Use auction price (60c)", "Use worked-out price (1s 80c)", or "Clear my price". */
export function resetPriceLabel(auto: AutoPrice | undefined): string {
  if (!auto) return "Clear my price";
  const kind = auto.from === "auction" ? "auction" : "worked-out";
  return `Use ${kind} price (${formatPrice(auto.copper)})`;
}
