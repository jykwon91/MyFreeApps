import type { EnchantSlot, PriceItem } from "@/games/wow-forever/crafting/cheapestRoute";
import type { PriceBook } from "@/games/wow-forever/crafting/matPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";
import type { CraftRecipe, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

/** One profession's route at today's prices — what `pricedRoute` works out, with no React state. */
export interface PricedRouteResult {
  /** The route to show: the cheapest at today's prices, or the default. */
  entries: ResolvedRouteEntry[];
  cheapest: boolean;
  /** Something on this guide's list has a price, so rows, the total and the shopping list show costs. */
  hasCosts: boolean;
  /** A priced profession with costs: the cheapest route is worked out and the default is one tick away. */
  canCompare: boolean;
  total: number;
  /** Skill `total` gets you to. */
  reach: number;
  unknown: boolean;
  /** The total stops at a "pick what you can get" row, not at a missing price. */
  stopsAtChoice: boolean;
  /** This guide's materials priced without you typing (auction or worked out), and how many there are. */
  autoPriced: number;
  materials: number;
  /** Overrides you typed for this guide's materials. */
  overridden: number;
  /** Null when there's nothing to price with, so the shopping list shows no costs then. */
  priceBook: PriceBook | null;
  items: { main: PriceItem[]; more: PriceItem[] };
  formulas: CraftRecipe[];
  /** The enchant slots that count for this profession (none unless it has the slot list). */
  excludedSlots: ReadonlySet<EnchantSlot>;
  /** Each of this guide's materials that has a price nobody typed: its auction price, else one worked out. */
  autoPrices: ReadonlyMap<number, AutoPrice>;
}
