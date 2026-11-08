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
import { autoPrice, derivePrices, withDerived, type Makers } from "@/games/wow-forever/crafting/derivedPrices";
import { createPriceBook, type EnteredPrices, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import { useExcludedSlots, useKnownRecipes, usePriceOverrides, type PriceOverrides } from "@/games/wow-forever/hooks/useCraftPrices";
import { auctionCopper, effectivePrices } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";
import type { DerivedPrice } from "@/games/wow-forever/types/derivedPrice";
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
  /** This guide's materials priced without you typing (auction or worked out), and how many there are. */
  autoPriced: number;
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
  /** Each of this guide's materials that has a price nobody typed: its auction price, else one worked out. */
  autoPrices: ReadonlyMap<number, AutoPrice>;
}

const NO_OVERRIDES: EnteredPrices = {};
const NO_MAKERS: Makers = {};

function countPriced(items: readonly PriceItem[], prices: EnteredPrices): number {
  return items.filter((i) => prices[String(i.id)] !== undefined).length;
}

/**
 * Everything the route section needs for prices. That's the auction prices
 * with your overrides on top, prices worked out for what isn't sold yet, the cheapest route at those prices (Tailoring,
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
  // Auction prices and yours; then whatever can be worked out from those.
  const known = useMemo(() => effectivePrices(auction, typed), [auction, typed]);

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
  const all = useMemo(() => [...items.main, ...items.more], [items]);
  const makers = data.file.makers ?? NO_MAKERS;
  const derived = useMemo(() => derivePrices(known, makers, all.map((i) => i.id)), [known, makers, all]);
  const prices = useMemo(() => withDerived(known, derived), [known, derived]);
  const autoPrices = useMemo(() => autoPricesFor(all, auction, derived), [all, auction, derived]);
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
    autoPriced: autoPrices.size,
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
    autoPrices,
  };
}

function autoPricesFor(
  items: readonly PriceItem[],
  auction: AuctionPrices | null,
  derived: ReadonlyMap<number, DerivedPrice>,
): ReadonlyMap<number, AutoPrice> {
  const out = new Map<number, AutoPrice>();
  for (const item of items) {
    const price = autoPrice(auctionCopper(auction, item.id), derived.get(item.id));
    if (price) out.set(item.id, price);
  }
  return out;
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
