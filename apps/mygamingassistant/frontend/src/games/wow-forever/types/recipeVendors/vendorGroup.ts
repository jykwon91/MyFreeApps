import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { VendorOffer } from "@/games/wow-forever/types/recipeVendors/vendorOffer";

/** One vendor (at one spot) and every recipe of the guide they sell — one trip buys them all. */
export interface VendorGroup {
  key: string;
  vendor: VendorSpot;
  offers: readonly VendorOffer[];
  /** Straight-line yards from you; Infinity on another continent; null when your location isn't known. */
  yards: number | null;
  /** How many of the offers are on the leveling route. */
  onRoute: number;
}
