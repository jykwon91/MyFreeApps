import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

/** A vendor, and how far away they are. */
export interface NearVendor {
  vendor: VendorSpot;
  /** Straight-line yards; Infinity on another continent; null when your location isn't known. */
  yards: number | null;
}
