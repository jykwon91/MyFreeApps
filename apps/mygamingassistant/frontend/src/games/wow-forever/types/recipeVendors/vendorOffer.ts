import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

/** One recipe on one vendor's window, with that vendor's stock of it. */
export interface VendorOffer {
  recipe: VendorRecipe;
  /** Limited stock — shared by the realm, it sells out and comes back later. */
  limited: boolean;
  stock: number;
  restockMinutes: number;
}
