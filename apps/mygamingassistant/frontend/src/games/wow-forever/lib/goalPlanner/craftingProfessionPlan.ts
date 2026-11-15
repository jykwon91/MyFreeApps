/**
 * One crafting profession's part of the Goal planner: the cheapest route at
 * today's auction prices (the same `pricedRoute` the Professions guide runs)
 * cut to your skill and goal, what it costs, what it needs bought, its rank
 * visits with the trainer recipes it uses, and stops for the Patterns /
 * Formulas it needs that you don't have yet.
 */
import { costBetween, type EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { expectedCrafts } from "@/games/wow-forever/crafting/craftRoute";
import { isGathered } from "@/games/wow-forever/crafting/matSources";
import type { EnteredPrices, PriceBook } from "@/games/wow-forever/crafting/matPrices";
import { craftContext, pricedRoute } from "@/games/wow-forever/crafting/pricedRoute";
import { shoppingList } from "@/games/wow-forever/crafting/shoppingList";
import { clipRoute } from "@/games/wow-forever/lib/goalPlanner/clipRoute";
import { mergeTrainerVisits } from "@/games/wow-forever/lib/goalPlanner/mergeTrainerVisits";
import { phaseForSkill } from "@/games/wow-forever/lib/goalPlanner/rankSkills";
import { rankStops } from "@/games/wow-forever/lib/goalPlanner/rankStops";
import { recipeItemStop } from "@/games/wow-forever/lib/goalPlanner/recipeStops";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export interface CraftingPlanInput {
  profession: CraftingProfession;
  label: string;
  /** Your skill now; 0 = not learned. */
  current: number;
  target: number;
  data: CraftingData;
  auction: AuctionPrices | null;
  overrides: EnteredPrices;
  knownFormulas: ReadonlySet<number>;
  excludedSlots: ReadonlySet<EnchantSlot>;
  faction: PlayerFaction;
  /** Trainer recipes you asked for, learned on this profession's trainer visits. */
  extraTaught: readonly TaughtRecipe[];
}

function craftRow(entry: ResolvedRouteEntry, profession: CraftingProfession, book: PriceBook | null): PlanCraftRow {
  const { from, to } = entry.step;
  if (entry.kind === "options") {
    return { profession, name: entry.step.title, spell: null, itemId: null, from, to, trainerSkill: null, crafts: null, cost: undefined };
  }
  const crafts = expectedCrafts(entry.recipe, from, to);
  return {
    profession,
    name: entry.recipe.name,
    spell: entry.recipe.spell,
    itemId: entry.recipe.creates?.id ?? null,
    from,
    to,
    trainerSkill: entry.learn.kind === "trainer" ? entry.learn.skill : null,
    crafts: Number.isFinite(crafts) ? crafts : null,
    cost: book ? costBetween(entry.recipe, book, from, to) : undefined,
  };
}

/** Trainer recipes the route uses; one taught below the skill you already have is taken as known. */
function routeTaught(entries: readonly ResolvedRouteEntry[], current: number): TaughtRecipe[] {
  return entries.flatMap((e) =>
    e.kind === "craft" && e.learn.kind === "trainer" && (current === 0 || e.learn.skill >= current)
      ? [{ spell: e.recipe.spell, name: e.recipe.name, skill: e.learn.skill }]
      : [],
  );
}

/** A stop for every Pattern / Formula the route needs that you haven't marked as known. */
function formulaStops(input: CraftingPlanInput, entries: readonly ResolvedRouteEntry[]): { stops: PlanStop[]; notes: PlanNote[] } {
  const stops: PlanStop[] = [];
  const notes: PlanNote[] = [];
  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.kind !== "craft" || entry.learn.kind !== "item") continue;
    const { itemId, item, skill } = entry.learn;
    if (seen.has(itemId) || input.knownFormulas.has(entry.recipe.spell)) continue;
    seen.add(itemId);
    const result = recipeItemStop({
      id: `${input.profession}-formula-${itemId}`,
      title: `Get ${item}`,
      profession: input.profession,
      skill,
      itemId,
      sources: input.data.sources.recipe(itemId),
      faction: input.faction,
    });
    if ("id" in result) stops.push(result);
    else notes.push(result);
  }
  return { stops, notes };
}

export function craftingProfessionPlan(input: CraftingPlanInput): ProfessionPlan {
  const { profession, data, target } = input;
  const from = Math.max(input.current, 1);
  const priced = pricedRoute({
    profession,
    data,
    start: from,
    auction: input.auction,
    overrides: input.overrides,
    knownFormulas: input.knownFormulas,
    excludedSlots: input.excludedSlots,
    useDefault: false,
  });
  const book = priced.priceBook;
  const entries = clipRoute(priced.entries, from, target);
  const rows = entries.map((e) => craftRow(e, profession, book));
  const shoppingLabel = craftContext(profession, data).professionLabel;
  const gathered = (id: number) => isGathered(data.sources.reagent(id));
  const shopping = shoppingList(entries, from, data.file, shoppingLabel, gathered, book?.buyInstead).buy;
  const formulas = formulaStops(input, entries);
  const visits = mergeTrainerVisits({
    profession,
    label: input.label,
    faction: input.faction,
    rankStops: rankStops({ profession, current: input.current, target }, input.faction, input.label),
    taught: [...routeTaught(entries, input.current), ...input.extraTaught],
    startPhase: phaseForSkill(profession, from),
  });
  return {
    profession,
    label: input.label,
    from,
    to: target,
    rows,
    cost: rows.reduce((sum, r) => sum + (r.cost ?? 0), 0),
    costUnknown: rows.some((r) => r.cost === undefined),
    stops: [...visits, ...formulas.stops],
    notes: formulas.notes,
    shopping,
    counted: true,
    unitPrice: book ? (id, name) => book.item(id, name) : null,
  };
}
