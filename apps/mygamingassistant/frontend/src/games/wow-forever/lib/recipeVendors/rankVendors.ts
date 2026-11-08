import { canBuyFrom } from "@/games/wow-forever/food/recipeSources";
import { vendorYards } from "@/games/wow-forever/lib/recipeVendors/vendorDistance";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { NearVendor } from "@/games/wow-forever/types/recipeVendors/nearVendor";
import type { RankedVendors } from "@/games/wow-forever/types/recipeVendors/rankedVendors";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

/** Nearer first; an unknown distance (a zone the map can't place) after every known one. */
function yardsOrder(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The better trip first: nearer (another continent, then unknown, last), then
 * your own faction's vendor before a neutral one (it's in your towns), then by name.
 */
export function byTrip(faction: PlayerFaction) {
  return (a: NearVendor, b: NearVendor): number =>
    yardsOrder(a.yards, b.yards) ||
    Number(a.vendor.faction !== faction) - Number(b.vendor.faction !== faction) ||
    a.vendor.name.localeCompare(b.vendor.name);
}

/** Vendors you can buy from, best trip first, and the other faction's (by name — you can't use them). */
export function rankVendors(vendors: readonly VendorSpot[], place: VendorPlace): RankedVendors {
  const near = vendors.map((vendor) => ({ vendor, yards: vendorYards(vendor, place) }));
  return {
    yours: near.filter((n) => canBuyFrom(n.vendor.faction, place.faction)).sort(byTrip(place.faction)),
    other: near.filter((n) => !canBuyFrom(n.vendor.faction, place.faction)).sort((a, b) => a.vendor.name.localeCompare(b.vendor.name)),
  };
}
