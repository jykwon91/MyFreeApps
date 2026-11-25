/**
 * The cheapest leveling route for the prices a player entered.
 *
 * The hand-written route stays the backbone: its rod rows (a runed rod later
 * enchants need in your bags) and its end-of-route "options" row are kept as
 * they are, so tools exist exactly when they do today. Between those, every
 * skill point is bought with whichever recipe costs least per *expected*
 * point (price / chance), with a small penalty for switching recipe so the
 * route doesn't flip-flop on near-ties. A stretch with nothing priced falls
 * back to the hand-written row, flagged so the page can say what to price.
 */
import { expectedCrafts, learnAt, learnSkill, MAX_CRAFT_SKILL, mustAcquire, resolveRoute, skillColors } from "@/games/wow-forever/crafting/craftRoute";
import type { PriceBook } from "@/games/wow-forever/crafting/matPrices";
import type { RecipeSale } from "@/games/wow-forever/types/auctionHouse/recipeSale";
import type { RowSale } from "@/games/wow-forever/types/auctionHouse/rowSale";
import type {
  CraftingFile,
  CraftRecipe,
  CraftRouteEntry,
  ResolvedCraftStep,
  ResolvedRouteEntry,
  RouteRowSource,
  TrainerSkills,
} from "@/games/wow-forever/types/crafting";

/** Gear slots an enchant can go on — parsed from "Enchant <Slot> - …". */
export const ENCHANT_SLOTS = ["Bracer", "Cloak", "Chest", "Boots", "Gloves", "Shield", "Weapon", "2H Weapon", "Off-Hand", "Necklace"] as const;
export type EnchantSlot = (typeof ENCHANT_SLOTS)[number];

/**
 * Switching recipe must save more than this share of a point's cheapest
 * cost. Half a point ≈ "5% cheaper over a 10-point stretch" — enough to stop
 * the route alternating between two recipes that cost the same.
 */
export const SWITCH_PENALTY_POINTS = 0.5;

/** Rows from here on weren't reachable in the beta and aren't checked in the live game yet — the hand route's own rule. */
export const UNCONFIRMED_FROM = 200;

export function enchantSlot(name: string): EnchantSlot | null {
  const match = /^Enchant (.+?) - /.exec(name);
  if (!match) return null;
  return ENCHANT_SLOTS.find((slot) => slot === match[1]) ?? null;
}

/** What the player told us beyond prices: formulas bought, slots they can't enchant. */
export interface RouteChoices {
  knownFormulas: ReadonlySet<number>;
  excludedSlots: ReadonlySet<EnchantSlot>;
  /** Spells of the specializations you chose (with the ones they need): a recipe for another one is left out. None chosen = none allowed. */
  allowedSpecs?: ReadonlySet<number>;
}

/** What each recipe's products sell for, by spell; null = the route is about materials only. */
export type RouteSales = ReadonlyMap<number, RecipeSale> | null;

/**
 * Patterns the hand-written route itself tells you to get (its craft rows).
 * The guide already sends you for them, so the cheapest route may use them
 * without a tick. The options row is left out on purpose: it lists what you
 * *might* have, not what the guide expects you to buy.
 */
export function routePatterns(ctx: Pick<CraftContext, "route" | "recipes">): ReadonlySet<number> {
  const spells = new Set<number>();
  for (const entry of ctx.route) {
    const recipe = entry.kind === "craft" ? ctx.recipes.get(entry.spell) : undefined;
    if (recipe && mustAcquire(recipe)) spells.add(recipe.spell);
  }
  return spells;
}

/** What you ticked plus the route's own patterns — the formulas the cheapest route may use. */
export function withRoutePatterns(ctx: Pick<CraftContext, "route" | "recipes">, choices: RouteChoices): RouteChoices {
  return { ...choices, knownFormulas: new Set([...choices.knownFormulas, ...routePatterns(ctx)]) };
}

/** The fixed inputs for one profession. */
export interface CraftContext {
  file: Pick<CraftingFile, "madeBy" | "recipes">;
  recipes: ReadonlyMap<number, CraftRecipe>;
  trainerSkills: TrainerSkills;
  route: readonly CraftRouteEntry[];
  ranks: readonly { skill: number }[];
  professionLabel: string;
}

export interface PricedRoute {
  entries: ResolvedRouteEntry[];
  /**
   * Expected net copper (materials less what the products sell for; negative = profit) from your skill up to `reach`. Rows past the first one
   * without a cost aren't added: totals over different sets of rows made the
   * default route look cheaper than the cheapest one.
   */
  total: number;
  /** Skill the total gets you to — where the first row without a cost starts, else the end. */
  reach: number;
  /** Some row ahead has no cost (a material without a price, or the options row). */
  unknown: boolean;
  /** At least one row was picked for the prices — else it's just the default route. */
  priced: boolean;
}

/** Chance a craft at `skill` gives a point: sure while orange, then falling to 0 at grey. */
export function pointChance(recipe: Pick<CraftRecipe, "yellow" | "grey">, skill: number): number {
  if (skill < recipe.yellow) return 1;
  return Math.max(0, (recipe.grey - skill) / (recipe.grey - recipe.yellow));
}

/** Expected crafts from `from` to `to`, not rounded — for costs. */
function exactCrafts(recipe: Pick<CraftRecipe, "yellow" | "grey">, from: number, to: number): number {
  let total = 0;
  for (let skill = from; skill < to; skill++) total += 1 / pointChance(recipe, skill);
  return total;
}

/** Expected copper to take `recipe` from skill `from` to `to`; undefined when a material has no price. */
export function costBetween(recipe: CraftRecipe, book: PriceBook, from: number, to: number): number | undefined {
  const unit = book.recipe(recipe).price;
  return unit === undefined ? undefined : unit * exactCrafts(recipe, from, to);
}

/** You can use it: a start / trainer recipe, or a formula / quest / NPC recipe you've learned — and the slot is one you can enchant. */
export function usable(recipe: CraftRecipe, choices: RouteChoices): boolean {
  if (mustAcquire(recipe) && !choices.knownFormulas.has(recipe.spell)) return false;
  if (recipe.spec !== undefined && !choices.allowedSpecs?.has(recipe.spec)) return false;
  const slot = enchantSlot(recipe.name);
  return !(slot && choices.excludedSlots.has(slot));
}

/** Every item some recipe needs in your bags (runed rods). */
function toolIds(recipes: readonly CraftRecipe[]): Set<number> {
  return new Set(recipes.flatMap((r) => (r.tool ? [r.tool.id] : [])));
}

function isFixed(entry: ResolvedRouteEntry, tools: ReadonlySet<number>): boolean {
  if (entry.kind === "options") return true;
  return entry.recipe.creates !== undefined && tools.has(entry.recipe.creates.id);
}

/** Cost (or what still needs a price) for a craft row from `start` on. */
function withCost(entry: ResolvedCraftStep, book: PriceBook, start: number, source: RouteRowSource, sales: RouteSales): ResolvedCraftStep {
  const from = Math.max(entry.step.from, start);
  const unit = book.recipe(entry.recipe);
  if (unit.price === undefined) return { ...entry, source, missing: unit.missing };
  const crafts = exactCrafts(entry.recipe, from, entry.step.to);
  const sale = sales?.get(entry.recipe.spell);
  if (!sale) return { ...entry, source, cost: unit.price * crafts, missing: [] };
  const rowSale: RowSale = { materials: unit.price * crafts, sells: sale.sells * crafts, gap: sale.gap, onSale: sale.onSale };
  return { ...entry, source, cost: rowSale.materials - rowSale.sells, sale: rowSale, missing: [] };
}

/** Add costs to the rows still ahead of `start`; earlier rows are history and stay as they are. */
export function annotateRoute(entries: readonly ResolvedRouteEntry[], book: PriceBook, start: number, sales: RouteSales = null): ResolvedRouteEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== "craft" || entry.step.to <= start || entry.source) return entry;
    return { kind: "craft", ...withCost(entry, book, start, "default", sales) };
  });
}

/** Total expected cost from `start`, and whether anything ahead has no cost. */
export function routeTotal(entries: readonly ResolvedRouteEntry[], start: number): Omit<PricedRoute, "entries"> {
  let total = 0;
  let reach: number | null = null;
  let priced = false;
  for (const entry of entries) {
    if (entry.step.to <= start) continue;
    if (entry.kind === "craft" && entry.source === "priced") priced = true;
    if (reach !== null) continue;
    if (entry.kind === "options" || entry.cost === undefined) {
      reach = Math.max(entry.step.from, start);
      continue;
    }
    total += entry.cost;
  }
  return { total, reach: reach ?? MAX_CRAFT_SKILL, unknown: reach !== null, priced };
}

function rowEntry(
  ctx: CraftContext,
  recipe: CraftRecipe,
  from: number,
  to: number,
  defaults: readonly ResolvedRouteEntry[],
): ResolvedCraftStep {
  // The hand route's note ("Soul Dust comes from …") still applies when it's the same recipe.
  const same = defaults.find((e) => e.kind === "craft" && e.step.spell === recipe.spell && e.step.from < to && from < e.step.to);
  const note = same?.kind === "craft" ? same.step.note : undefined;
  return {
    step: {
      kind: "craft",
      spell: recipe.spell,
      from,
      to,
      ...(note ? { note } : {}),
      confidence: from < UNCONFIRMED_FROM ? "confirmed" : "unconfirmed",
    },
    recipe,
    crafts: expectedCrafts(recipe, from, to),
    learn: learnAt(recipe, ctx.trainerSkills),
  };
}

interface Candidate {
  recipe: CraftRecipe;
  /** Copper one craft costs: materials, less what its products sell for on a profit route (negative = a profit). */
  unit: number;
  learnSkill: number;
  /**
   * Skill where it turns green. The route stops using a recipe there, as the
   * page's colour legend says ("green — move on"): a green recipe can still
   * look cheapest when it's the only one you've priced, and the route then
   * asked for 74 crafts to gain 8 points. Past green, a stretch with nothing
   * orange or yellow priced falls back to the hand-written row instead.
   */
  green: number;
}

interface PointPick {
  skill: number;
  /** Null = nothing priced here; use the hand route. */
  spell: number | null;
  cost: number;
}

/** The hand route's craft row covering `skill`. */
function defaultAt(defaults: readonly ResolvedRouteEntry[], skill: number): ResolvedCraftStep | null {
  const entry = defaults.find((e) => e.kind === "craft" && e.step.from <= skill && skill < e.step.to);
  if (entry?.kind !== "craft") return null;
  return entry;
}

/**
 * Pick a recipe for every point in [from, to): a DP over (point, recipe)
 * where staying on a recipe is free and switching costs SWITCH_PENALTY_POINTS
 * of that point's cheapest cost. Deterministic: ties keep the hand route's
 * recipe, then the lower spell id.
 */
function planPoints(
  from: number,
  to: number,
  candidates: readonly Candidate[],
  toolReady: ReadonlyMap<number, number>,
  defaults: readonly ResolvedRouteEntry[],
): PointPick[] {
  const picks: PointPick[] = [];
  let run: { skill: number; options: { spell: number; cost: number }[]; cheapest: number }[] = [];

  function flush(): void {
    if (!run.length) return;
    const back: Map<number, number>[] = [];
    let totals = new Map<number, number>();
    run.forEach((point, i) => {
      let bestPrev: number | null = null;
      let bestPrevTotal = Number.POSITIVE_INFINITY;
      for (const [spell, total] of totals) {
        if (total < bestPrevTotal) {
          bestPrev = spell;
          bestPrevTotal = total;
        }
      }
      // |cheapest|: on a profit route a point can pay (negative cost); switching must still cost something.
      const penalty = SWITCH_PENALTY_POINTS * Math.abs(point.cheapest);
      const next = new Map<number, number>();
      const pointBack = new Map<number, number>();
      for (const option of point.options) {
        const stay = totals.get(option.spell);
        if (i === 0 || bestPrev === null) {
          next.set(option.spell, option.cost);
          continue;
        }
        const switched = bestPrevTotal + penalty;
        if (stay !== undefined && stay <= switched) {
          next.set(option.spell, stay + option.cost);
          pointBack.set(option.spell, option.spell);
          continue;
        }
        next.set(option.spell, switched + option.cost);
        pointBack.set(option.spell, bestPrev);
      }
      back.push(pointBack);
      totals = next;
    });
    let spell: number | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [s, total] of totals) {
      if (total < best) {
        spell = s;
        best = total;
      }
    }
    const chosen: number[] = [];
    for (let i = run.length - 1; i >= 0; i--) {
      chosen[i] = spell as number;
      if (i > 0) spell = back[i].get(spell as number) ?? null;
    }
    run.forEach((point, i) => {
      const cost = point.options.find((o) => o.spell === chosen[i])?.cost ?? 0;
      picks.push({ skill: point.skill, spell: chosen[i], cost });
    });
    run = [];
  }

  for (let skill = from; skill < to; skill++) {
    const preferred = defaultAt(defaults, skill)?.step.spell;
    // Hand-route recipe first, then by spell id: the DP's strict `<` keeps the first of equals.
    const options = candidates
      .filter((c) => c.learnSkill <= skill && skill < c.green && toolIsReady(c.recipe, toolReady, skill))
      .map((c) => ({ spell: c.recipe.spell, cost: c.unit / pointChance(c.recipe, skill) }))
      .sort((a, b) => Number(b.spell === preferred) - Number(a.spell === preferred) || a.spell - b.spell);
    if (!options.length) {
      flush();
      picks.push({ skill, spell: null, cost: 0 });
      continue;
    }
    run.push({ skill, options, cheapest: Math.min(...options.map((o) => o.cost)) });
  }
  flush();
  return picks;
}

/** The rod a recipe needs is made by now (rods you never make count as never ready). */
function toolIsReady(recipe: CraftRecipe, toolReady: ReadonlyMap<number, number>, skill: number): boolean {
  if (!recipe.tool) return true;
  return (toolReady.get(recipe.tool.id) ?? Number.POSITIVE_INFINITY) <= skill;
}

/** Cut [from, to) at each trainer rank's skill, so each rank is trained before its cap. */
function rankCuts(from: number, to: number, ranks: readonly { skill: number }[]): number[] {
  return [from, ...ranks.map((r) => r.skill).filter((s) => s > from && s < to), to];
}

/** Turn per-point picks into route rows. */
function picksToRows(
  ctx: CraftContext,
  picks: readonly PointPick[],
  defaults: readonly ResolvedRouteEntry[],
  book: PriceBook,
  start: number,
  sales: RouteSales,
): ResolvedRouteEntry[] {
  const rows: ResolvedRouteEntry[] = [];
  let i = 0;
  while (i < picks.length) {
    const first = picks[i];
    const fallback = first.spell === null ? defaultAt(defaults, first.skill) : null;
    let j = i + 1;
    while (j < picks.length && picks[j].spell === first.spell && (first.spell !== null || defaultAt(defaults, picks[j].skill) === fallback)) j++;
    const from = first.skill;
    const to = picks[j - 1].skill + 1;
    const recipe = first.spell === null ? fallback?.recipe : ctx.recipes.get(first.spell);
    i = j;
    if (!recipe) continue;
    const cuts = rankCuts(from, to, ctx.ranks);
    for (let k = 0; k < cuts.length - 1; k++) {
      const row = rowEntry(ctx, recipe, cuts[k], cuts[k + 1], defaults);
      if (first.spell === null && fallback) {
        // The hand-written row, sliced to this stretch — keep its note and confidence.
        rows.push({ kind: "craft", ...withCost({ ...row, step: { ...fallback.step, from: cuts[k], to: cuts[k + 1] } }, book, start, "default", sales) });
        continue;
      }
      rows.push({ kind: "craft", ...withCost(row, book, start, "priced", sales) });
    }
  }
  return rows;
}

/** The cheapest route from `startSkill` for these prices and choices. */
export function cheapestRoute(ctx: CraftContext, startSkill: number, book: PriceBook, choices: RouteChoices, sales: RouteSales = null): PricedRoute {
  const defaults = resolveRoute(ctx.route, ctx.recipes, ctx.trainerSkills);
  const tools = toolIds(ctx.file.recipes);
  const toolReady = new Map<number, number>();
  for (const e of defaults) {
    if (e.kind === "craft" && e.recipe.creates && tools.has(e.recipe.creates.id)) toolReady.set(e.recipe.creates.id, e.step.to);
  }

  // Starting inside a fixed row (the end-of-route options) means that row is where you are.
  const inFixed = defaults.find((e) => isFixed(e, tools) && e.step.from <= startSkill && startSkill < e.step.to);
  const begin = inFixed ? inFixed.step.from : startSkill;

  const out: ResolvedRouteEntry[] = [];
  for (const e of defaults) {
    if (e.step.to <= begin) out.push(e);
    else if (e.kind === "craft" && e.step.from < begin) {
      out.push({ ...e, step: { ...e.step, to: begin }, crafts: expectedCrafts(e.recipe, e.step.from, begin) });
    }
  }

  const candidates: Candidate[] = [];
  for (const recipe of ctx.file.recipes) {
    // Rods are fixed rows, made once — never a skill-up to repeat. Disenchant (no
    // reagents) is in the recipe list but isn't something you craft for points.
    if (!usable(recipe, choices) || !recipe.reagents.length || (recipe.creates && tools.has(recipe.creates.id))) continue;
    const materials = book.recipe(recipe).price;
    if (materials === undefined) continue;
    const unit = materials - (sales?.get(recipe.spell)?.sells ?? 0);
    candidates.push({ recipe, unit, learnSkill: learnSkill(learnAt(recipe, ctx.trainerSkills)), green: skillColors(recipe).green });
  }

  const fixedRows = defaults.filter((e) => isFixed(e, tools) && e.step.to > begin);
  let skill = begin;
  while (skill < MAX_CRAFT_SKILL) {
    const fixed = fixedRows.find((e) => e.step.from <= skill && skill < e.step.to);
    if (fixed) {
      out.push(...annotateRoute([fixed], book, startSkill, sales));
      skill = fixed.step.to;
      continue;
    }
    const next = fixedRows.find((e) => e.step.from > skill)?.step.from ?? MAX_CRAFT_SKILL;
    const picks = planPoints(skill, next, candidates, toolReady, defaults);
    out.push(...picksToRows(ctx, picks, defaults, book, startSkill, sales));
    skill = next;
  }

  return { entries: out, ...routeTotal(out, startSkill) };
}
