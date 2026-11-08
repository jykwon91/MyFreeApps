import type { NearVendor } from "@/games/wow-forever/types/recipeVendors/nearVendor";

/** Vendors you can buy from (best trip first) and the other faction's (by name). */
export interface RankedVendors {
  yours: NearVendor[];
  other: NearVendor[];
}
