import { byTrip, rankVendors } from "@/games/wow-forever/lib/recipeVendors/rankVendors";
import type { NearestBuy } from "@/games/wow-forever/types/recipeVendors/nearestBuy";
import type { RecipeBuy } from "@/games/wow-forever/types/recipeVendors/recipeBuy";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

type VendorBuy = Extract<NearestBuy, { kind: "vendor" }>;
type OtherFactionBuy = Extract<NearestBuy, { kind: "otherFaction" }>;

/**
 * For each recipe a vendor sells, the nearest vendor you can buy it from —
 * nearest recipe first. A recipe only the other faction sells says so, last;
 * one no vendor sells is left out (its Learn line covers drops and quests).
 */
export function nearestBuys(buys: readonly RecipeBuy[], place: VendorPlace): NearestBuy[] {
  const found: VendorBuy[] = [];
  const theirs: OtherFactionBuy[] = [];
  for (const buy of buys) {
    const { yours, other } = rankVendors(buy.sources.vendors, place);
    if (yours[0]) found.push({ kind: "vendor", buy, near: yours[0] });
    else if (other[0]) theirs.push({ kind: "otherFaction", buy, faction: other[0].vendor.faction });
  }
  const trip = byTrip(place.faction);
  return [...found.sort((a, b) => trip(a.near, b.near)), ...theirs];
}
