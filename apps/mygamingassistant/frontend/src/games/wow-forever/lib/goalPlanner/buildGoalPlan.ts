/**
 * The Goal planner: every profession goal and wanted recipe turned into ONE
 * plan. Each profession's route, rank visits and recipe stops come from its
 * own guide data; the stops are grouped into trips (everything you can do
 * now, then each round of new ranks), each trip put in travel order with the
 * World Map's planner, and the materials merged into one shopping list.
 */
import type { EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import type { EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import {
  FIRST_PHASE_TITLE,
  LATER_PHASE_TITLE,
  OPTION_CANDIDATES,
  PLANNER_PROFESSIONS,
  PLANNER_PROFESSION_LABELS,
} from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import { combinedShopping } from "@/games/wow-forever/lib/goalPlanner/combinedShopping";
import { cookingProfessionPlan } from "@/games/wow-forever/lib/goalPlanner/cookingProfessionPlan";
import { craftingProfessionPlan } from "@/games/wow-forever/lib/goalPlanner/craftingProfessionPlan";
import { goalNotes } from "@/games/wow-forever/lib/goalPlanner/goalNotes";
import { orderPhase } from "@/games/wow-forever/lib/goalPlanner/orderStops";
import { recipeGoal } from "@/games/wow-forever/lib/goalPlanner/recipeStops";
import { rankVisitSkills, relativePhase } from "@/games/wow-forever/lib/goalPlanner/relativePhase";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";
import type { GoalPlannerGoals } from "@/games/wow-forever/types/goalPlanner/goalPlannerGoals";
import type { OrderedStop } from "@/games/wow-forever/types/goalPlanner/orderedStop";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanPhase } from "@/games/wow-forever/types/goalPlanner/planPhase";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";
import type { TravelModel } from "@/games/wow-forever/types/goalPlanner/travelModel";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { Endpoint } from "@/games/wow-forever/worldMap/trip";

const NO_FORMULAS: ReadonlySet<number> = new Set();

export interface GoalPlanInput<P> {
  goals: GoalPlannerGoals;
  /** Each crafting profession's data, loaded for every crafting goal. */
  crafting: ReadonlyMap<CraftingProfession, CraftingData>;
  recipeBook: readonly RecipeEntry[];
  auction: AuctionPrices | null;
  overrides: EnteredPrices;
  knownFormulas: Readonly<Partial<Record<CraftingProfession, ReadonlySet<number>>>>;
  excludedSlots: ReadonlySet<EnchantSlot>;
  faction: PlayerFaction;
  /** Your character level; null when you haven't said. */
  level: number | null;
  /** Your faction's auctioneers, for the "buy materials" stop. */
  auctioneers: readonly StopOption[];
  model: TravelModel<P>;
  start: P;
  endpointOf: (place: P) => Endpoint;
}

/** Goals that still have skill to gain, one per profession, in picker order. */
function activeGoals(goals: readonly ProfessionGoal[]): ProfessionGoal[] {
  const byProfession = new Map(goals.map((g) => [g.profession, g]));
  return PLANNER_PROFESSIONS.flatMap((p) => {
    const goal = byProfession.get(p);
    return goal && goal.target > Math.max(goal.current, 1) ? [goal] : [];
  });
}

interface RecipeParts {
  stops: PlanStop[];
  taught: Map<PlannerProfession, TaughtRecipe[]>;
  notes: PlanNote[];
  /** The wanted recipes the plan found, for the skill check. */
  entries: RecipeEntry[];
}

function recipeParts(keys: readonly string[], book: readonly RecipeEntry[], leveling: ReadonlySet<PlannerProfession>, faction: PlayerFaction): RecipeParts {
  const byKey = new Map(book.map((e) => [e.key, e]));
  const parts: RecipeParts = { stops: [], taught: new Map(), notes: [], entries: [] };
  for (const key of keys) {
    const entry = byKey.get(key);
    if (!entry) continue;
    parts.entries.push(entry);
    const result = recipeGoal(entry, faction, PLANNER_PROFESSION_LABELS[entry.profession], leveling.has(entry.profession));
    if (result.kind === "stop") parts.stops.push(result.stop);
    else if (result.kind === "note") parts.notes.push(result.note);
    else parts.taught.set(result.profession, [...(parts.taught.get(result.profession) ?? []), result.recipe]);
  }
  return parts;
}

function professionPlan<P>(goal: ProfessionGoal, input: GoalPlanInput<P>, extraTaught: readonly TaughtRecipe[]): ProfessionPlan | null {
  const label = PLANNER_PROFESSION_LABELS[goal.profession];
  if (goal.profession === PROFESSION.cooking) {
    return cookingProfessionPlan({ label, current: goal.current, target: goal.target, auction: input.auction, faction: input.faction, extraTaught });
  }
  const data = input.crafting.get(goal.profession);
  if (!data) return null;
  return craftingProfessionPlan({
    profession: goal.profession,
    label,
    current: goal.current,
    target: goal.target,
    data,
    auction: input.auction,
    overrides: input.overrides,
    knownFormulas: input.knownFormulas[goal.profession] ?? NO_FORMULAS,
    excludedSlots: input.excludedSlots,
    faction: input.faction,
    extraTaught,
  });
}

/** One stop per recipe item (a wanted recipe the route also needs is bought once). */
function uniqueStops(stops: readonly PlanStop[]): PlanStop[] {
  const seen = new Set<string>();
  return stops.filter((s) => {
    const key = s.kind === PLAN_STOP_KIND.recipe && s.itemId !== null ? `item-${s.itemId}` : s.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Each stop on the trip its profession reaches it on: rank visits by their skill, recipes by the skill they're learned at. */
function placeOnTrips(stops: readonly PlanStop[], plans: readonly ProfessionPlan[]): PlanStop[] {
  const skillsOf = new Map(plans.map((p) => [p.profession, rankVisitSkills(p)]));
  return stops.map((stop) => {
    const skills = stop.profession ? skillsOf.get(stop.profession) : undefined;
    const at = stop.kind === PLAN_STOP_KIND.recipe ? stop.learnSkill : stop.skill;
    return { ...stop, phase: skills && at !== null ? relativePhase(skills, at) : 0 };
  });
}

function auctionStop(auctioneers: readonly StopOption[]): PlanStop {
  return {
    id: "auction-house",
    kind: PLAN_STOP_KIND.auction,
    title: "Buy materials at the auction house",
    detail: "Everything on the shopping list you won't gather yourself.",
    profession: null,
    phase: 0,
    skill: null,
    learnSkill: null,
    level: null,
    options: auctioneers,
    teaches: [],
    itemId: null,
    cost: null,
  };
}

/** "When Tailoring reaches 200 and Cooking reaches 50": the skills that open a trip's rank visits. */
function phaseWhen(stops: readonly OrderedStop[]): string {
  const reached = new Map<PlannerProfession, number>();
  for (const { stop } of stops) {
    if (!stop.profession || stop.skill === null) continue;
    reached.set(stop.profession, Math.max(reached.get(stop.profession) ?? 0, stop.skill));
  }
  if (!reached.size) return "Along the way";
  const parts = [...reached].map(([p, skill]) => `${PLANNER_PROFESSION_LABELS[p]} reaches ${skill}`);
  return `When ${parts.join(" and ")}`;
}

function craftingByPhase(plans: readonly ProfessionPlan[]): Map<number, PlanCraftRow[]> {
  const rows = new Map<number, PlanCraftRow[]>();
  for (const plan of plans) {
    const skills = rankVisitSkills(plan);
    for (const row of plan.rows) {
      const phase = relativePhase(skills, row.from);
      rows.set(phase, [...(rows.get(phase) ?? []), row]);
    }
  }
  return rows;
}

export function buildGoalPlan<P>(input: GoalPlanInput<P>): GoalPlan {
  const goals = activeGoals(input.goals.professions);
  const leveling = new Set(goals.map((g) => g.profession));
  const recipes = recipeParts(input.goals.recipes, input.recipeBook, leveling, input.faction);
  const plans = goals.flatMap((g) => {
    const plan = professionPlan(g, input, recipes.taught.get(g.profession) ?? []);
    return plan ? [plan] : [];
  });
  const shopping = combinedShopping(plans);
  const auction = shopping.length && input.auctioneers.length ? [auctionStop(input.auctioneers)] : [];
  const stops = placeOnTrips(uniqueStops([...auction, ...plans.flatMap((p) => p.stops), ...recipes.stops]), plans);
  const crafting = craftingByPhase(plans);
  const lastPhase = Math.max(0, ...stops.map((s) => s.phase), ...crafting.keys());

  const phases: PlanPhase[] = [];
  const unplaced: PlanStop[] = [];
  let here = input.start;
  let previous: Endpoint | null = null;
  for (let index = 0; index <= lastPhase; index++) {
    const ordered = orderPhase(here, stops.filter((s) => s.phase === index), input.model, OPTION_CANDIDATES);
    unplaced.push(...ordered.unplaced);
    here = ordered.end;
    const placed: OrderedStop[] = ordered.stops.map((s) => {
      const to = input.endpointOf(s.place);
      const stop: OrderedStop = { stop: s.stop, option: s.option, leg: s.leg, to, from: previous };
      previous = to;
      return stop;
    });
    const rows = crafting.get(index) ?? [];
    if (!placed.length && !rows.length) continue;
    phases.push({
      index: phases.length,
      title: phases.length === 0 ? FIRST_PHASE_TITLE : `${LATER_PHASE_TITLE} ${phases.length + 1}`,
      when: index === 0 ? "Right away" : phaseWhen(placed),
      stops: placed,
      crafting: rows,
    });
  }

  const visited = phases.flatMap((p) => p.stops);
  return {
    phases,
    professions: plans,
    shopping,
    materialsCost: plans.reduce((sum, p) => sum + p.cost, 0),
    vendorCost: visited.reduce((sum, s) => sum + (s.stop.cost ?? 0), 0),
    costUnknown: plans.some((p) => p.costUnknown),
    crafts: plans.reduce((sum, p) => sum + p.rows.reduce((n, r) => n + (r.crafts ?? 0), 0), 0),
    travelSeconds: visited.reduce((sum, s) => sum + (s.leg?.seconds ?? 0), 0),
    unplaced,
    notes: goalNotes({ goals: input.goals.professions, plans, recipeNotes: recipes.notes, wanted: recipes.entries, stops: visited, unplaced, level: input.level }),
  };
}
