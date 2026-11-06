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
import { createPriceBook, type EnteredPrices, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import type { CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { useExcludedSlots, useKnownRecipes, usePriceOverrides, type PriceOverrides } from "@/games/wow-forever/hooks/useCraftPrices";
import { effectivePrices } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession, CraftRecipe, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";

export interface PricedRouteState {
  /** The route to show: the cheapest at today's prices, or the default. */
  entries: ResolvedRouteEntry[];
  cheapest: boolean;
  /** Something on this guide's list has a price, so rows, the total and the shopping list show costs. */
  hasCosts: boolean;
  /** A priced profession with costs: the cheapest route is worked out and the default is one tick away. */
  canCompare: boolean;
  useDefault: boolean;
  setUseDefault: (useDefault: boolean) => void;
  total: number;
  /** Skill `total` gets you to. */
  reach: number;
  unknown: boolean;
  /** The total stops at a "pick what you can get" row, not at a missing price. */
  stopsAtChoice: boolean;
  /** This guide's materials with an auction price, and how many of them there are. */
  auctionPriced: number;
  materials: number;
  /** Overrides you typed for this guide's materials. */
  overridden: number;
  /** Null when there's nothing to price with, so the shopping list shows no costs then. */
  priceBook: PriceBook | null;
  items: { main: PriceItem[]; more: PriceItem[] };
  formulas: CraftRecipe[];
  knownFormulas: ReadonlySet<number>;
  setFormula: (spell: number, known: boolean) => void;
  excludedSlots: ReadonlySet<EnchantSlot>;
  setSlot: (slot: EnchantSlot, allowed: boolean) => void;
  overrides: PriceOverrides;
  /** Null while the auction prices load, or when they failed. */
  auction: AuctionPrices | null;
}

const NO_OVERRIDES: EnteredPrices = {};

function countPriced(items: readonly PriceItem[], prices: EnteredPrices): number {
  return items.filter((i) => prices[String(i.id)] !== undefined).length;
}

/**
 * Everything the route section needs for prices. That's the auction prices
 * with your overrides on top, the cheapest route at those prices (Tailoring,
 * Enchanting), and the default route with what each row costs. The DP is
 * memoized on its inputs, so typing elsewhere on the page doesn't rerun it.
 */
export function usePricedRoute(profession: CraftingProfession, data: CraftingData, skill: number | null): PricedRouteState {
  const overrides = usePriceOverrides();
  const { prices: auction } = useAuctionPrices();
  const [knownFormulas, setFormula] = useKnownRecipes(profession);
  const [slotsExcluded, setSlot] = useExcludedSlots();
  const [useDefault, setUseDefault] = useState(false);
  const start = skill ?? 1;
  const features = CRAFTING_FEATURES[profession];
  // Slots only mean something for enchants; other professions never exclude any.
  const excludedSlots = useMemo(
    () => (features.enchantSlots ? slotsExcluded : new Set<EnchantSlot>()),
    [features.enchantSlots, slotsExcluded],
  );
  // Overrides only exist where the prices panel does, so one typed on Tailoring never prices another guide.
  const typed = features.priced ? overrides.prices : NO_OVERRIDES;
  const prices = useMemo(() => effectivePrices(auction, typed), [auction, typed]);

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
  const all = [...items.main, ...items.more];
  const hasCosts = countPriced(all, prices) > 0;
  const canCompare = features.priced && hasCosts;

  const book = useMemo(() => createPriceBook(prices, ctx.file, ctx.professionLabel), [prices, ctx]);
  const defaults = useMemo(() => resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills), [ctx]);
  const computed = useMemo(() => (canCompare ? cheapestRoute(ctx, start, book, choices) : null), [canCompare, ctx, start, book, choices]);

  const shown = pickShown(defaults, computed, useDefault, hasCosts, book, start);
  return {
    ...shown,
    stopsAtChoice: shown.unknown && stopRow(shown.entries, shown.reach, start)?.kind === "options",
    hasCosts,
    canCompare,
    useDefault,
    setUseDefault,
    auctionPriced: all.filter((i) => auction?.byId.has(i.id)).length,
    materials: all.length,
    overridden: countPriced(all, typed),
    priceBook: hasCosts ? book : null,
    items,
    formulas,
    knownFormulas,
    setFormula,
    excludedSlots,
    setSlot,
    overrides,
    auction,
  };
}

function pickShown(
  defaults: ResolvedRouteEntry[],
  computed: ReturnType<typeof cheapestRoute> | null,
  useDefault: boolean,
  hasCosts: boolean,
  book: PriceBook,
  start: number,
): Pick<PricedRouteState, "entries" | "cheapest" | "total" | "reach" | "unknown"> {
  if (!hasCosts) return { entries: defaults, cheapest: false, total: 0, reach: start, unknown: true };
  if (computed && computed.priced && !useDefault) {
    return { entries: computed.entries, cheapest: true, total: computed.total, reach: computed.reach, unknown: computed.unknown };
  }
  // The default route with what each row costs at today's prices, so the two can be compared.
  const entries = annotateRoute(defaults, book, start);
  const { total, reach, unknown } = routeTotal(entries, start);
  return { entries, cheapest: false, total, reach, unknown };
}

/** The row the total stops at: the first one ahead from `reach` that is a choice or has no cost. */
function stopRow(entries: readonly ResolvedRouteEntry[], reach: number, start: number): ResolvedRouteEntry | undefined {
  return entries.find(
    (e) => e.step.to > start && Math.max(e.step.from, start) >= reach && (e.kind === "options" || e.cost === undefined),
  );
}
