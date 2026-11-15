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
import { auctionCopper, effectivePrices } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";
import type { CraftingProfession, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { DerivedPrice } from "@/games/wow-forever/types/derivedPrice";
import type { PricedRouteResult } from "@/games/wow-forever/types/pricedRouteResult";

const NO_OVERRIDES: EnteredPrices = {};
const NO_MAKERS: Makers = {};
const NO_SLOTS: ReadonlySet<EnchantSlot> = new Set();

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
  /** Show the hand-written route with costs rather than the cheapest one. */
  useDefault: boolean;
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

type Shown = Pick<PricedRouteResult, "entries" | "cheapest" | "total" | "reach" | "unknown">;

function pickShown(
  defaults: ResolvedRouteEntry[],
  computed: ReturnType<typeof cheapestRoute> | null,
  useDefault: boolean,
  hasCosts: boolean,
  book: PriceBook,
  start: number,
): Shown {
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

export function pricedRoute(input: PricedRouteInput): PricedRouteResult {
  const { profession, data, start, auction, useDefault } = input;
  const features = CRAFTING_FEATURES[profession];
  // Slots only mean something for enchants; other professions never exclude any.
  const excludedSlots = features.enchantSlots ? input.excludedSlots : NO_SLOTS;
  // Overrides only exist where the prices panel does, so one typed on Tailoring never prices another guide.
  const typed = features.priced ? input.overrides : NO_OVERRIDES;
  // Auction prices and yours; then whatever can be worked out from those.
  const known = effectivePrices(auction, typed);
  const ctx = craftContext(profession, data);
  const choices: RouteChoices = { knownFormulas: input.knownFormulas, excludedSlots };
  const items = priceItems(ctx, start, choices);
  const formulas = formulaChoices(ctx, start, choices);
  const all = [...items.main, ...items.more];
  const derived = derivePrices(known, data.file.makers ?? NO_MAKERS, all.map((i) => i.id));
  const prices = withDerived(known, derived);
  const autoPrices = autoPricesFor(all, auction, derived);
  const hasCosts = countPriced(all, prices) > 0;
  const canCompare = features.priced && hasCosts;
  const book = createPriceBook(prices, ctx.file, ctx.professionLabel);
  const defaults = resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills);
  const computed = canCompare ? cheapestRoute(ctx, start, book, choices) : null;
  const shown = pickShown(defaults, computed, useDefault, hasCosts, book, start);
  return {
    ...shown,
    stopsAtChoice: shown.unknown && stopRow(shown.entries, shown.reach, start)?.kind === "options",
    hasCosts,
    canCompare,
    autoPriced: autoPrices.size,
    materials: all.length,
    overridden: countPriced(all, typed),
    priceBook: hasCosts ? book : null,
    items,
    formulas,
    excludedSlots,
    autoPrices,
  };
}
