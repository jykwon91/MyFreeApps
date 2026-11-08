import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { RECIPE_VENDOR_TEXT } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";
import type { VendorGroup } from "@/games/wow-forever/types/recipeVendors/vendorGroup";

/** "~350 yd away" / "Another continent — boat or zeppelin"; null when your location isn't known. */
export function distanceText(yards: number | null): string | null {
  if (yards === null) return null;
  if (!Number.isFinite(yards)) return RECIPE_VENDOR_TEXT.otherContinent;
  return `${formatYards(yards)} away`;
}

/** "1g 50s"; null when not known. */
export function priceText(price: number | null): string | null {
  return price === null ? null : formatPrice(price);
}

/** "3 recipes · 2 on your route". */
export function offerSummary(group: Pick<VendorGroup, "offers" | "onRoute">): string {
  const count = group.offers.length;
  const recipes = `${count} ${count === 1 ? "recipe" : "recipes"}`;
  return group.onRoute > 0 ? `${recipes} · ${group.onRoute} on your route` : recipes;
}
