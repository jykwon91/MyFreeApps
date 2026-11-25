import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { placeLabel, splitVendors } from "@/games/wow-forever/food/recipeSources";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { RestoreOption } from "@/games/wow-forever/types/restoreOption";
import type { RestoreTrack } from "@/games/wow-forever/types/restoreTrack";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const FREE_FROM_MAGE = "Free from a Mage";

/** "2,148 health over 30 sec" / "4,200 mana over 30 sec". */
export function describeAmount(option: RestoreOption, track: RestoreTrack): string {
  return `${option.amount.toLocaleString()} ${track === "food" ? "health" : "mana"} over ${option.seconds} sec`;
}

/** "Free from a Mage · Mage level 60" — the level only when the client gives it. */
export function describeMage(option: RestoreOption): string {
  return option.mageLevel === null ? FREE_FROM_MAGE : `${FREE_FROM_MAGE} · Mage level ${option.mageLevel}`;
}

/** Where a vendor sells it: "Buy from Innkeeper Allison, Goldshire, Elwynn Forest · 40s". */
function describeVendor(option: RestoreOption, sources: ItemSources, faction: PlayerFaction): string {
  const vendor = splitVendors(sources.vendors, faction, null).yours[0];
  const price = option.vendorCopper === null ? "" : ` · ${formatCost(option.vendorCopper)}`;
  return vendor ? `Buy from ${vendor.name}, ${placeLabel(vendor)}${price}` : `Sold by a vendor${price}`;
}

/** The mob worth farming for it: "Dropped by Scarlet Monk (level 35–40), Western Plaguelands". */
function describeDrop(sources: ItemSources): string {
  const mob = sources.drop?.mobs[0];
  if (!mob) return "Dropped by mobs";
  const levels = mob.minLevel === mob.maxLevel ? `${mob.minLevel}` : `${mob.minLevel}–${mob.maxLevel}`;
  const place = mob.spot ? `, ${placeLabel(mob.spot)}` : "";
  return `Dropped by ${mob.name} (level ${levels})${place}`;
}

/** How to get it, in one line. */
export function describeWay(option: RestoreOption, sources: ItemSources, faction: PlayerFaction): string {
  if (option.way === "mage") return describeMage(option);
  if (option.way === "vendor") return describeVendor(option, sources, faction);
  if (option.way === "drop") return describeDrop(sources);
  return "Cook it, or buy it at the auction house";
}
