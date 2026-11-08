import { canBuyFrom } from "@/games/wow-forever/food/recipeSources";
import { byTrip } from "@/games/wow-forever/lib/recipeVendors/rankVendors";
import { vendorYards } from "@/games/wow-forever/lib/recipeVendors/vendorDistance";
import { vendorKey } from "@/games/wow-forever/lib/recipeVendors/vendorKey";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { VendorGroup } from "@/games/wow-forever/types/recipeVendors/vendorGroup";
import type { VendorGroups } from "@/games/wow-forever/types/recipeVendors/vendorGroups";
import type { VendorOffer } from "@/games/wow-forever/types/recipeVendors/vendorOffer";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

/** Route recipes first, then by the skill they ask, then by name. */
function offerOrder(a: VendorOffer, b: VendorOffer): number {
  return (
    Number(b.recipe.onRoute) - Number(a.recipe.onRoute) ||
    (a.recipe.skill ?? 0) - (b.recipe.skill ?? 0) ||
    a.recipe.name.localeCompare(b.recipe.name)
  );
}

/** Vendors with route recipes first, then the better trip, then whoever sells the most. */
function groupOrder(place: VendorPlace) {
  const trip = byTrip(place.faction);
  return (a: VendorGroup, b: VendorGroup): number =>
    Number(b.onRoute > 0) - Number(a.onRoute > 0) || trip(a, b) || b.offers.length - a.offers.length;
}

/**
 * Every vendor-sold recipe, grouped by the vendor who sells it — one stop
 * buys everything that vendor has. A recipe several vendors sell shows under
 * each of them.
 */
export function groupRecipeVendors(recipes: readonly VendorRecipe[], place: VendorPlace): VendorGroups {
  const groups = new Map<string, { vendor: VendorSpot; offers: VendorOffer[] }>();
  for (const recipe of recipes) {
    for (const vendor of recipe.vendors) {
      const key = vendorKey(vendor);
      const group = groups.get(key) ?? { vendor, offers: [] };
      group.offers.push({ recipe, limited: vendor.limited, stock: vendor.stock, restockMinutes: vendor.restockMinutes });
      groups.set(key, group);
    }
  }
  const all: VendorGroup[] = [...groups].map(([key, g]) => ({
    key,
    vendor: g.vendor,
    offers: [...g.offers].sort(offerOrder),
    yards: vendorYards(g.vendor, place),
    onRoute: g.offers.filter((o) => o.recipe.onRoute).length,
  }));
  const order = groupOrder(place);
  return {
    yours: all.filter((g) => canBuyFrom(g.vendor.faction, place.faction)).sort(order),
    other: all.filter((g) => !canBuyFrom(g.vendor.faction, place.faction)).sort(order),
  };
}

/** Recipes that only the other faction's vendors sell — you'd need someone on that side (or another source). */
export function otherFactionOnly(recipes: readonly VendorRecipe[], place: VendorPlace): VendorRecipe[] {
  return recipes.filter((r) => !r.vendors.some((v) => canBuyFrom(v.faction, place.faction)));
}
