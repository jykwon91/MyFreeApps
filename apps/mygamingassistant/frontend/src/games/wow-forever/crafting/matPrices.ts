/**
 * Auction-house prices for crafting materials, as the player types them.
 *
 * Everything is in copper internally (1g = 100s = 10 000c). A per-unit price
 * can be fractional (a Mote of Magic is a third of a Strange Dust), so only
 * what's *shown* is rounded.
 */
import { makerOf } from "@/games/wow-forever/crafting/shoppingList";
import type { CraftingFile, CraftRecipe } from "@/games/wow-forever/types/crafting";

export const COPPER_PER_SILVER = 100;
export const COPPER_PER_GOLD = 10_000;
/** Nobody types a price above this; it's almost certainly a typo. */
export const MAX_PRICE_GOLD = 99_999;
export const MAX_PRICE_COPPER = MAX_PRICE_GOLD * COPPER_PER_GOLD;

const UNIT_COPPER: Readonly<Record<string, number>> = { g: COPPER_PER_GOLD, s: COPPER_PER_SILVER, c: 1 };

/** "1g 20s", "1.5g", "45s", "80c" — one number, then an optional unit. */
const TOKEN = /(\d+(?:\.\d+)?)\s*([gsc]?)/gy;

/**
 * Parse what a player typed into copper, or null when it isn't a price.
 *
 * Units `g` / `s` / `c` combine in any order, each at most once, decimals
 * allowed ("1.5g", "1g 20s 5c"). A bare number with no unit is **silver**:
 * most low-level materials are priced in silver, and the field always shows
 * the value it read ("= 1g 20s") so it is never ambiguous. A bare number can't
 * be mixed with units ("1g 20" — 20 what?). 0 is fine: a material you farm
 * yourself costs you nothing.
 */
export function parsePrice(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (text === "") return null;
  const seen = new Set<string>();
  let total = 0;
  let tokens = 0;
  let bare = false;
  let index = 0;
  while (index < text.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(text);
    if (!match) return null;
    const [, amount, unit] = match;
    const key = unit || "bare";
    if (seen.has(key)) return null;
    seen.add(key);
    if (!unit) bare = true;
    total += Number(amount) * (unit ? UNIT_COPPER[unit] : COPPER_PER_SILVER);
    tokens += 1;
    index = TOKEN.lastIndex;
    while (text[index] === " ") index += 1;
  }
  if (bare && tokens > 1) return null;
  const copper = Math.round(total);
  if (!Number.isFinite(copper) || copper > MAX_PRICE_COPPER) return null;
  return copper;
}

/** 12005 -> "1g 20s 5c"; zero parts are left out; 0 -> "0c". */
export function formatPrice(copper: number): string {
  const whole = Math.round(copper);
  if (whole <= 0) return "0c";
  const gold = Math.floor(whole / COPPER_PER_GOLD);
  const silver = Math.floor((whole % COPPER_PER_GOLD) / COPPER_PER_SILVER);
  const rest = whole % COPPER_PER_SILVER;
  const parts: string[] = [];
  if (gold) parts.push(`${gold}g`);
  if (silver) parts.push(`${silver}s`);
  if (rest) parts.push(`${rest}c`);
  return parts.join(" ");
}

/**
 * An expected cost, e.g. "~1g 20s". Above a gold the coppers are noise, so
 * it's rounded to the silver; below, to the copper.
 */
export function formatCost(copper: number): string {
  if (copper >= COPPER_PER_GOLD) return `~${formatPrice(Math.round(copper / COPPER_PER_SILVER) * COPPER_PER_SILVER)}`;
  return `~${formatPrice(copper)}`;
}

/**
 * Lesser / Greater essence pairs. In game you right-click 3 Lesser into 1
 * Greater and back, free — so each is never worth more than the other's
 * equivalent. Ids are `enchanting.json`'s.
 */
export const ESSENCE_PAIRS: readonly { lesser: number; greater: number }[] = [
  { lesser: 10938, greater: 10939 }, // Magic
  { lesser: 10998, greater: 11082 }, // Astral
  { lesser: 11134, greater: 11135 }, // Mystic
  { lesser: 11174, greater: 11175 }, // Nether
  { lesser: 16202, greater: 16203 }, // Eternal
];
export const LESSER_PER_GREATER = 3;

/** The other half of an essence pair, and how many of this one it equals. */
export function essencePartner(itemId: number): { id: number; perThis: number } | null {
  const pair = ESSENCE_PAIRS.find((p) => p.lesser === itemId || p.greater === itemId);
  if (!pair) return null;
  if (pair.lesser === itemId) return { id: pair.greater, perThis: 1 / LESSER_PER_GREATER };
  return { id: pair.lesser, perThis: LESSER_PER_GREATER };
}

/** Item id -> entered price in copper. */
export type EnteredPrices = Readonly<Record<string, number>>;

/** What one unit of an item costs you, and the raw items that still need a price when unknown. */
export interface ItemPrice {
  /** Undefined = not known. Never 0 for "unknown" — 0 means free. */
  price: number | undefined;
  missing: readonly { id: number; name: string }[];
}

export interface PriceBook {
  item(itemId: number, name: string): ItemPrice;
  /** Reagents for one craft; undefined cost when any reagent is unknown. */
  recipe(recipe: Pick<CraftRecipe, "reagents">): ItemPrice;
}

function minDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function enteredWithEssence(entered: EnteredPrices, itemId: number): number | undefined {
  const own = entered[String(itemId)];
  const partner = essencePartner(itemId);
  if (!partner) return own;
  const other = entered[String(partner.id)];
  return minDefined(own, other === undefined ? undefined : other * partner.perThis);
}

/**
 * Effective prices: what you typed, essences at their cheaper conversion, and
 * items this profession makes itself (bolts, Mote of Magic) at the cost of
 * their materials per unit made.
 */
export function createPriceBook(
  entered: EnteredPrices,
  file: Pick<CraftingFile, "madeBy" | "recipes">,
  professionLabel: string,
): PriceBook {
  const cache = new Map<number, ItemPrice>();
  const inProgress = new Set<number>();

  function recipePrice(recipe: Pick<CraftRecipe, "reagents">): ItemPrice {
    let total = 0;
    const missing: { id: number; name: string }[] = [];
    for (const reagent of recipe.reagents) {
      const p = item(reagent.id, reagent.name);
      if (p.price === undefined) {
        for (const m of p.missing) if (!missing.some((x) => x.id === m.id)) missing.push(m);
        continue;
      }
      total += p.price * reagent.count;
    }
    if (missing.length) return { price: undefined, missing };
    return { price: total, missing };
  }

  function madePrice(itemId: number): ItemPrice | null {
    if (file.madeBy[String(itemId)] !== professionLabel || inProgress.has(itemId)) return null;
    const maker = makerOf(itemId, file.recipes);
    if (!maker?.creates) return null;
    inProgress.add(itemId);
    const cost = recipePrice(maker);
    inProgress.delete(itemId);
    if (cost.price === undefined) return cost;
    return { price: cost.price / maker.creates.count, missing: [] };
  }

  function item(itemId: number, name: string): ItemPrice {
    const hit = cache.get(itemId);
    if (hit) return hit;
    const own = enteredWithEssence(entered, itemId);
    const made = madePrice(itemId);
    const result = combine(itemId, name, own, made);
    // Mid-recursion results (an item made from itself) aren't final — don't cache them.
    if (!inProgress.size) cache.set(itemId, result);
    return result;
  }

  function combine(itemId: number, name: string, own: number | undefined, made: ItemPrice | null): ItemPrice {
    const price = minDefined(own, made?.price);
    if (price !== undefined) return { price, missing: [] };
    // A bolt with no price: ask for the cloth, not the bolt (bolts aren't on the price list).
    if (made?.missing.length) return { price, missing: made.missing };
    return { price, missing: [{ id: itemId, name }] };
  }

  return { item, recipe: recipePrice };
}
