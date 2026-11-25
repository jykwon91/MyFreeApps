/**
 * One profession's route at today's prices, as a pure function: the auction
 * prices with your overrides on top, prices worked out for what isn't sold
 * yet, the cheapest route at those prices (Tailoring, Enchanting), and the
 * default route with what each row costs. `usePricedRoute` (one guide) and the
 * Goal planner (several professions at once) both run it.
 */
import {
  annotateRoute,
  cheapestRoute,
  routePatterns,
  routeTotal,
  withRoutePatterns,
  type CraftContext,
  type RouteSales,
  type EnchantSlot,
  type RouteChoices,
} from "@/games/wow-forever/crafting/cheapestRoute";
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { formulaChoices, priceItems, type PriceItem } from "@/games/wow-forever/crafting/priceItems";
import { specChain } from "@/games/wow-forever/crafting/craftSpecs";
import { autoPrice, derivePrices, withDerived, type Makers } from "@/games/wow-forever/crafting/derivedPrices";
import { createPriceBook, type EnteredPrices, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_SPECS } from "@/games/wow-forever/data/professions/crafting/craftingSpecs";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { AUCTION_CUT } from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import { recipeSales } from "@/games/wow-forever/lib/auctionHouse/productSale";
import { auctionCopper, effectivePrices } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";
import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";
import type { CraftingProfession, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { DerivedPrice } from "@/games/wow-forever/types/derivedPrice";
import type { PricedRouteResult } from "@/games/wow-forever/types/pricedRouteResult";

const NO_MAKERS: Makers = {};
const NO_SLOTS: ReadonlySet<EnchantSlot> = new Set();
const NO_SPECS: ReadonlySet<number> = new Set();

export interface PricedRouteInput {
  profession: CraftingProfession;
  data: CraftingData;
  /** Your skill (1 when you haven't said). */
  start: number;
  /** Null while the auction prices load, or when they failed. */
  auction: AuctionPrices | null;
  /** Every price you typed over the auction price; only used where the guide has a prices panel. */
  overrides: EnteredPrices;
  knownFormulas: ReadonlySet<number>;
  /** Slots you can't enchant; only Enchanting reads them. */
  excludedSlots: ReadonlySet<EnchantSlot>;
  /** Which route to work out: the cheapest at material prices, the one with the most profit, or the hand-written one with costs. */
  mode: CraftRouteMode;
  /** The specialization picked on the guide (one of the profession's choices), null = none yet; only Most profit and Cheapest read it. */
  spec: string | null;
}

/** The fixed inputs `cheapestRoute` needs for one profession. */
export function craftContext(profession: CraftingProfession, data: CraftingData): CraftContext {
  return {
    file: data.file,
    recipes: data.recipes,
    trainerSkills: data.trainerSkills,
    route: CRAFTING_ROUTES[profession],
    ranks: CRAFTING_RANKS[profession],
    professionLabel: CRAFTING_GUIDES[profession].label,
  };
}

function countPriced(items: readonly PriceItem[], prices: EnteredPrices): number {
  return items.filter((i) => prices[String(i.id)] !== undefined).length;
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

type Shown = Pick<PricedRouteResult, "entries" | "shown" | "total" | "reach" | "unknown">;

function pickShown(
  defaults: ResolvedRouteEntry[],
  computed: ReturnType<typeof cheapestRoute> | null,
  mode: CraftRouteMode,
  hasCosts: boolean,
  book: PriceBook,
  start: number,
  sales: RouteSales,
): Shown {
  if (!hasCosts) return { entries: defaults, shown: CRAFT_ROUTE_MODE.default, total: 0, reach: start, unknown: true };
  if (computed && computed.priced && mode !== CRAFT_ROUTE_MODE.default) {
    return { entries: computed.entries, shown: mode, total: computed.total, reach: computed.reach, unknown: computed.unknown };
  }
  // The default route with what each row costs at today's prices (and sells for, in Most profit), so the routes can be compared.
  const entries = annotateRoute(defaults, book, start, mode === CRAFT_ROUTE_MODE.profit ? sales : null);
  const { total, reach, unknown } = routeTotal(entries, start);
  return { entries, shown: CRAFT_ROUTE_MODE.default, total, reach, unknown };
}

/** The specialization spells the route may use: the chosen one and the ones it needs first. */
function allowedSpecsFor(profession: CraftingProfession, spec: string | null): ReadonlySet<number> {
  const specs = CRAFTING_SPECS[profession];
  if (!specs || spec === null) return NO_SPECS;
  return new Set(specChain(specs, spec).map((c) => c.spell));
}

/** The row the total stops at: the first one ahead from `reach` that is a choice or has no cost. */
function stopRow(entries: readonly ResolvedRouteEntry[], reach: number, start: number): ResolvedRouteEntry | undefined {
  return entries.find(
    (e) => e.step.to > start && Math.max(e.step.from, start) >= reach && (e.kind === "options" || e.cost === undefined),
  );
}

export function pricedRoute(input: PricedRouteInput): PricedRouteResult {
  const { profession, data, start, auction, mode } = input;
  const features = CRAFTING_FEATURES[profession];
  // Slots only mean something for enchants; other professions never exclude any.
  const excludedSlots = features.enchantSlots ? input.excludedSlots : NO_SLOTS;
  const typed = input.overrides;
  // Auction prices and yours; then whatever can be worked out from those.
  const known = effectivePrices(auction, typed);
  const ctx = craftContext(profession, data);
  const ticked: RouteChoices = { knownFormulas: input.knownFormulas, excludedSlots, allowedSpecs: allowedSpecsFor(profession, input.spec) };
  // The guide's own patterns count without a tick: it already sends you to get them.
  const choices = withRoutePatterns(ctx, ticked);
  const items = priceItems(ctx, start, choices);
  const formulas = formulaChoices(ctx, start, ticked);
  const all = [...items.main, ...items.more];
  const derived = derivePrices(known, data.file.makers ?? NO_MAKERS, all.map((i) => i.id));
  const prices = withDerived(known, derived);
  const autoPrices = autoPricesFor(all, auction, derived);
  const hasCosts = countPriced(all, prices) > 0;
  const canCompare = hasCosts;
  const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
  const defaults = resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills);
  const canProfit = canCompare && features.profit;
  const sales = canProfit && auction ? recipeSales(data.file.recipes, auction.byId, AUCTION_CUT[auction.faction]) : null;
  const wantsProfit = mode === CRAFT_ROUTE_MODE.profit && sales !== null;
  const computed = canCompare ? cheapestRoute(ctx, start, book, choices, wantsProfit ? sales : null) : null;
  const shown = pickShown(defaults, computed, wantsProfit || mode !== CRAFT_ROUTE_MODE.profit ? mode : CRAFT_ROUTE_MODE.cheapest, hasCosts, book, start, wantsProfit ? sales : null);
  return {
    ...shown,
    stopsAtChoice: shown.unknown && stopRow(shown.entries, shown.reach, start)?.kind === "options",
    hasCosts,
    canCompare,
    canProfit,
    autoPriced: autoPrices.size,
    materials: all.length,
    overridden: countPriced(all, typed),
    priceBook: hasCosts ? book : null,
    items,
    formulas,
    assumedFormulas: routePatterns(ctx),
    excludedSlots,
    autoPrices,
  };
}
