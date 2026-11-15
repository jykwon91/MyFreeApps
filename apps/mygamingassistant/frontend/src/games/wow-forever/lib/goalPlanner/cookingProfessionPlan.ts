/**
 * Cooking's part of the Goal planner. Cooking has no recipe-by-recipe route
 * data like the crafting professions: its guide is a hand-written list of
 * stretches ("Spiced Wolf Meat, 10–50") with the meats they use but no
 * counts. So its rows have no craft counts or costs, its shopping lines no
 * quantities, and a stretch that names several recipes ("Roast Raptor, Hot
 * Wolf Ribs or Mithril Head Trout") becomes one stop at any of their vendors.
 */
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { PROFESSION, type CraftStep, type MatRef } from "@/games/wow-forever/data/professions/professionTypes";
import { mergeTrainerVisits } from "@/games/wow-forever/lib/goalPlanner/mergeTrainerVisits";
import { phaseForSkill } from "@/games/wow-forever/lib/goalPlanner/rankSkills";
import { rankStops } from "@/games/wow-forever/lib/goalPlanner/rankStops";
import { noPlaceReason, recipeItemPlaces, recipeItemStop } from "@/games/wow-forever/lib/goalPlanner/recipeStops";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { ShoppingLine } from "@/games/wow-forever/types/crafting";
import { PLAN_NOTE_KIND } from "@/games/wow-forever/types/goalPlanner/planNoteKind";
import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export interface CookingPlanInput {
  label: string;
  /** Your skill now; 0 = not learned. */
  current: number;
  target: number;
  auction: AuctionPrices | null;
  faction: PlayerFaction;
  /** Trainer recipes you asked for, learned on Cooking's trainer visits. */
  extraTaught: readonly TaughtRecipe[];
}

interface CookingStretch {
  step: CraftStep;
  from: number;
  to: number;
}

/** The guide's stretches cut to your skill and goal ("10–50" → 10 to 50). */
function stretches(from: number, to: number): CookingStretch[] {
  return COOKING_ROUTE.flatMap((step): CookingStretch[] => {
    if (step.kind !== "craft") return [];
    const numbers = (step.skill.match(/\d+/g) ?? []).map(Number);
    if (numbers.length < 2) return [];
    const start = Math.max(numbers[0], from);
    const end = Math.min(numbers[numbers.length - 1], to);
    return end > start ? [{ step, from: start, to: end }] : [];
  });
}

function cookingRow(stretch: CookingStretch): PlanCraftRow {
  const recipes = stretch.step.recipes ?? [];
  return {
    profession: PROFESSION.cooking,
    name: stretch.step.name,
    spell: null,
    itemId: recipes.length === 1 ? recipes[0].id : null,
    from: stretch.from,
    to: stretch.to,
    trainerSkill: null,
    crafts: null,
    cost: undefined,
  };
}

/** Every meat and spice the stretches name, once each, with no count (the guide gives none). */
function cookingShopping(list: readonly CookingStretch[]): ShoppingLine[] {
  const lines = new Map<number, ShoppingLine>();
  for (const { step } of list) {
    for (const mat of step.mats ?? []) if (!lines.has(mat.id)) lines.set(mat.id, { id: mat.id, name: mat.name, count: 0 });
  }
  return [...lines.values()];
}

interface CookingRecipe {
  ref: MatRef;
  itemId: number;
  skill: number;
}

/** A stretch's recipes with their Recipe item; a food the data has no Recipe item for is left out. */
function stretchRecipes(step: CraftStep): CookingRecipe[] {
  return (step.recipes ?? []).flatMap((ref) => {
    const learn = FOODS.find((f) => f.id === ref.id)?.learn;
    if (!learn?.recipeItem) return [];
    return [{ ref, itemId: learn.recipeItem, skill: learn.skill ?? 1 }];
  });
}

/** One stop for a stretch's recipes: one recipe's own stop, or any one of several from all their places. */
function recipeStop(step: CraftStep, faction: PlayerFaction): PlanStop | PlanNote | null {
  const recipes = stretchRecipes(step);
  if (!recipes.length) return null;
  const id = `cooking-recipe-${recipes[0].itemId}`;
  if (recipes.length === 1) {
    const only = recipes[0];
    const sources = FOOD_SOURCES.recipe(only.ref.id);
    return recipeItemStop({ id, title: `Get ${only.ref.name}`, profession: PROFESSION.cooking, skill: only.skill, itemId: only.itemId, sources, faction });
  }
  const options = new Map<string, StopOption>();
  const found: string[] = [];
  for (const recipe of recipes) {
    const places = recipeItemPlaces(FOOD_SOURCES.recipe(recipe.ref.id), faction);
    if (!places) continue;
    found.push(recipe.ref.name);
    for (const option of places.options) if (!options.has(option.key)) options.set(option.key, option);
  }
  const names = recipes.map((r) => r.ref.name).join(", ");
  if (!options.size) {
    const reason = noPlaceReason(FOOD_SOURCES.recipe(recipes[0].ref.id));
    return { kind: PLAN_NOTE_KIND.noSource, text: `${names}: ${reason}.` };
  }
  const skill = Math.min(...recipes.map((r) => r.skill));
  return {
    id,
    kind: PLAN_STOP_KIND.recipe,
    title: "Get one of these Cooking recipes",
    detail: `Any one of ${found.join(", ")} works for ${step.skill}. Learn it at skill ${skill}.`,
    profession: PROFESSION.cooking,
    phase: 0,
    skill: null,
    learnSkill: skill,
    level: null,
    options: [...options.values()],
    teaches: [],
    itemId: recipes[0].itemId,
    cost: null,
  };
}

export function cookingProfessionPlan(input: CookingPlanInput): ProfessionPlan {
  const profession = PROFESSION.cooking;
  const from = Math.max(input.current, 1);
  const list = stretches(from, input.target);
  const recipeStops: PlanStop[] = [];
  const notes: PlanNote[] = [];
  for (const { step } of list) {
    const result = recipeStop(step, input.faction);
    if (!result) continue;
    if ("id" in result) recipeStops.push(result);
    else notes.push(result);
  }
  const visits = mergeTrainerVisits({
    profession,
    label: input.label,
    faction: input.faction,
    rankStops: rankStops({ profession, current: input.current, target: input.target }, input.faction, input.label),
    taught: input.extraTaught,
    startPhase: phaseForSkill(profession, from),
  });
  const rows = list.map(cookingRow);
  return {
    profession,
    label: input.label,
    from,
    to: input.target,
    rows,
    cost: 0,
    costUnknown: rows.length > 0,
    stops: [...visits, ...recipeStops],
    notes,
    shopping: cookingShopping(list),
    counted: false,
    unitPrice: (id) => ({ price: auctionCopper(input.auction, id), missing: [] }),
  };
}
