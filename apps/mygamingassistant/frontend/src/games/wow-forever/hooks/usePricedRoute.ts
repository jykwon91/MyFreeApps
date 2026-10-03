import { useMemo, useState } from "react";
import {
  annotateRoute,
  cheapestRoute,
  formulaChoices,
  priceItems,
  routeTotal,
  type CraftContext,
  type EnchantSlot,
  type PriceItem,
  type RouteChoices,
} from "@/games/wow-forever/crafting/cheapestRoute";
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { createPriceBook, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { useExcludedSlots, useKnownRecipes, useMatPrices, type MatPrices } from "@/games/wow-forever/hooks/useCraftPrices";
import { CRAFTING_PROFESSION, type CraftingProfession, type CraftRecipe, type ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

export interface PricedRouteState {
  /** The route to show — cheapest for your prices, or the default. */
  entries: ResolvedRouteEntry[];
  cheapest: boolean;
  /** You've priced something on this guide's list, so there's a comparison to make. */
  canCompare: boolean;
  useDefault: boolean;
  setUseDefault: (useDefault: boolean) => void;
  total: number;
  unknown: boolean;
  /** Prices you entered for this guide's materials. */
  pricesEntered: number;
  /** Null until you've priced something — the shopping list shows no costs then. */
  priceBook: PriceBook | null;
  items: { main: PriceItem[]; more: PriceItem[] };
  formulas: CraftRecipe[];
  knownFormulas: ReadonlySet<number>;
  setFormula: (spell: number, known: boolean) => void;
  excludedSlots: ReadonlySet<EnchantSlot>;
  setSlot: (slot: EnchantSlot, allowed: boolean) => void;
  prices: MatPrices;
}

/**
 * Everything the route section needs for prices: what you entered, the
 * cheapest route for it, and the default route to compare against. The DP is
 * memoized on its inputs, so typing elsewhere on the page doesn't rerun it.
 */
export function usePricedRoute(profession: CraftingProfession, data: CraftingData, skill: number | null): PricedRouteState {
  const prices = useMatPrices();
  const [knownFormulas, setFormula] = useKnownRecipes(profession);
  const [slotsExcluded, setSlot] = useExcludedSlots();
  const [useDefault, setUseDefault] = useState(false);
  const start = skill ?? 1;
  // Slots only mean something for enchants; Tailoring never excludes any.
  const excludedSlots = useMemo(
    () => (profession === CRAFTING_PROFESSION.enchanting ? slotsExcluded : new Set<EnchantSlot>()),
    [profession, slotsExcluded],
  );

  const ctx = useMemo<CraftContext>(
    () => ({
      file: data.file,
      recipes: data.recipes,
      trainerSkills: data.trainerSkills,
      route: CRAFTING_ROUTES[profession],
      ranks: CRAFTING_RANKS[profession],
      professionLabel: CRAFTING_GUIDES[profession].label,
    }),
    [data, profession],
  );
  const choices = useMemo<RouteChoices>(() => ({ knownFormulas, excludedSlots }), [knownFormulas, excludedSlots]);
  const items = useMemo(() => priceItems(ctx, start, choices), [ctx, start, choices]);
  const formulas = useMemo(() => formulaChoices(ctx, start, choices), [ctx, start, choices]);
  const pricesEntered = [...items.main, ...items.more].filter((i) => prices.prices[String(i.id)] !== undefined).length;
  const canCompare = pricesEntered > 0;

  const book = useMemo(() => createPriceBook(prices.prices, ctx.file, ctx.professionLabel), [prices.prices, ctx]);
  const defaults = useMemo(() => resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills), [ctx]);
  const computed = useMemo(() => (canCompare ? cheapestRoute(ctx, start, book, choices) : null), [canCompare, ctx, start, book, choices]);

  const shown = pickShown(defaults, computed, useDefault, canCompare, book, start);
  return {
    ...shown,
    canCompare,
    useDefault,
    setUseDefault,
    pricesEntered,
    priceBook: canCompare ? book : null,
    items,
    formulas,
    knownFormulas,
    setFormula,
    excludedSlots,
    setSlot,
    prices,
  };
}

function pickShown(
  defaults: ResolvedRouteEntry[],
  computed: ReturnType<typeof cheapestRoute> | null,
  useDefault: boolean,
  canCompare: boolean,
  book: PriceBook,
  start: number,
): Pick<PricedRouteState, "entries" | "cheapest" | "total" | "unknown"> {
  if (!canCompare) return { entries: defaults, cheapest: false, total: 0, unknown: true };
  if (computed && computed.priced && !useDefault) {
    return { entries: computed.entries, cheapest: true, total: computed.total, unknown: computed.unknown };
  }
  // The default route, with what each row would cost at your prices — so the two compare.
  const entries = annotateRoute(defaults, book, start);
  const { total, unknown } = routeTotal(entries, start);
  return { entries, cheapest: false, total, unknown };
}
