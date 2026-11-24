import { pricedRoute } from "@/games/wow-forever/crafting/pricedRoute";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { stepOf } from "@/games/wow-forever/lib/professionsAddon/buildCraftingProfession";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { PricedRouteRow } from "@/games/wow-forever/types/auctionHouse/pricedRouteRow";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { CraftingProfession, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

function rowOf(entry: ResolvedRouteEntry, label: string): PricedRouteRow {
  const step = stepOf(entry, label);
  return {
    from: step.from,
    to: step.to,
    name: step.name,
    spell: step.spell,
    yellow: step.yellow,
    grey: step.grey,
    mats: step.mats,
    learn: step.learn,
    learnSkill: step.learnSkill,
    acquire: step.acquire,
    note: step.note,
    confirmed: step.confirmed,
    options: entry.kind === "options",
    cost: entry.kind === "craft" ? (entry.cost ?? null) : null,
    source: entry.kind === "craft" ? (entry.source ?? null) : null,
  };
}

/**
 * Each priced profession's cheapest route from skill 1 at one house's auction prices — the same
 * `pricedRoute` the Professions page runs, with no typed prices and no ticked patterns (the route's own
 * patterns count, as on the page). A profession with nothing priced there has no entry.
 */
export function pricedRouteRows(
  crafting: CraftingByProfession,
  auction: AuctionPrices,
): ReadonlyMap<CraftingProfession, readonly PricedRouteRow[]> {
  const out = new Map<CraftingProfession, readonly PricedRouteRow[]>();
  for (const [profession, data] of crafting) {
    if (!CRAFTING_FEATURES[profession].priced) continue;
    const result = pricedRoute({
      profession,
      data,
      start: 1,
      auction,
      overrides: {},
      knownFormulas: new Set(),
      excludedSlots: new Set(),
      useDefault: false,
    });
    if (!result.cheapest) continue;
    out.set(profession, result.entries.map((entry) => rowOf(entry, CRAFTING_GUIDES[profession].label)));
  }
  return out;
}
