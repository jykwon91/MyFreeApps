import type { WowClassId } from "@/games/wow-forever/data/classes";
import { splitVendors } from "@/games/wow-forever/food/recipeSources";
import type { ConsumableRecord } from "@/games/wow-forever/types/consumable";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";
import type { RestoreChoices } from "@/games/wow-forever/types/restoreChoices";
import type { RestoreOption, RestoreWay } from "@/games/wow-forever/types/restoreOption";
import type { RestoreTrack } from "@/games/wow-forever/types/restoreTrack";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Warriors and Rogues have no mana to get back, so they get food only. */
const NO_MANA: readonly WowClassId[] = ["warrior", "rogue"];

/** How many more options show under the Mage's. */
export const MAX_OTHER_OPTIONS = 5;

export function usesMana(classId: WowClassId): boolean {
  return !NO_MANA.includes(classId);
}

export interface RestoreInput {
  level: number;
  faction: PlayerFaction;
  /** Copper for an item on the auction house, when known. */
  auctionCopper: (itemId: number) => number | undefined;
  sourcesOf: (itemId: number) => ItemSources;
}

function toOption(
  item: ConsumableRecord | FoodRecord,
  track: RestoreTrack,
  way: RestoreWay,
  vendorCopper: number | null,
  mageLevel: number | null,
): RestoreOption | null {
  const restore = track === "food" ? item.heal : item.mana;
  if (!restore || restore.amount <= 0) return null;
  return { id: item.id, name: item.name, level: item.level, amount: restore.amount, seconds: restore.seconds, way, vendorCopper, mageLevel };
}

/** How a bought or farmed item reaches you — null when you can't get it (only the other faction's vendors, no drop). */
function wayOf(item: ConsumableRecord, input: RestoreInput): RestoreWay | null {
  const sources = input.sourcesOf(item.id);
  if (item.buyCopper !== null && splitVendors(sources.vendors, input.faction, null).yours.length > 0) return "vendor";
  return sources.drop ? "drop" : null;
}

/** What it costs you: a drop is free, a vendor has a price, cooked food only has the auction house's, when it lists it. */
function costOf(o: RestoreOption, input: RestoreInput): number {
  if (o.way === "drop") return 0;
  if (o.way === "vendor") return o.vendorCopper ?? Infinity;
  return input.auctionCopper(o.id) ?? Infinity;
}

/** An option that gives less than this share of the best one is for a lower level, not this one. */
const WORTH_SHARE = 0.5;

/** The strongest few that are worth eating at this level, cheapest first: dropped (free), bought, then by auction price, unpriced last. */
function cheapestOfTheBest(options: RestoreOption[], bestAmount: number, input: RestoreInput): RestoreOption[] {
  return options
    .filter((o) => o.amount >= bestAmount * WORTH_SHARE)
    .sort((a, b) => b.amount - a.amount || costOf(a, input) - costOf(b, input) || a.name.localeCompare(b.name))
    .slice(0, MAX_OTHER_OPTIONS)
    .sort((a, b) => costOf(a, input) - costOf(b, input) || b.amount - a.amount || a.name.localeCompare(b.name));
}

function isOption(o: RestoreOption | null): o is RestoreOption {
  return o !== null;
}

/**
 * What to eat or drink at a level: the Mage's conjured one at the highest rank
 * you can use, then up to five others that give at least half as much, from
 * cheapest to dearest (dropped, bought, cooked). A value the data lacks is left out.
 */
export function restoreChoices(
  track: RestoreTrack,
  consumables: readonly ConsumableRecord[],
  foods: readonly FoodRecord[],
  input: RestoreInput,
): RestoreChoices {
  const edible = consumables.filter((c) => c.level <= input.level);
  const conjured = edible.filter((c) => c.conjure !== null).map((c) => toOption(c, track, "mage", null, c.conjure?.level ?? null));
  const mage = conjured.filter(isOption).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))[0] ?? null;

  const bought = edible
    .filter((c) => c.conjure === null)
    .map((c) => {
      const way = wayOf(c, input);
      return way ? toOption(c, track, way, c.buyCopper, null) : null;
    });
  const cooked = foods
    .filter((f) => f.level <= input.level && (f.kind === "food" || f.kind === "drink"))
    .map((f) => toOption(f, track, "cooked", null, null));
  const candidates = [...bought, ...cooked].filter(isOption);
  const bestAmount = Math.max(mage?.amount ?? 0, ...candidates.map((o) => o.amount));
  return { mage, others: cheapestOfTheBest(candidates, bestAmount, input) };
}
