import type { VendorGroup } from "@/games/wow-forever/types/recipeVendors/vendorGroup";

/** Vendors you can buy from (your faction's and neutral, best trip first), and the other faction's. */
export interface VendorGroups {
  yours: readonly VendorGroup[];
  other: readonly VendorGroup[];
}
