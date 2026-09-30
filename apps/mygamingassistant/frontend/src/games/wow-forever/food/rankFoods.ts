import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { buffValue, fishingSkill, foodWeights, type FoodWeights } from "@/games/wow-forever/food/foodScore";
import type { FoodRecord } from "@/games/wow-forever/types/food";

export interface FoodPickerInput {
  level: number;
  classId: WowClassId;
  specId: string;
  activity: FoodActivity;
  /** Your Cooking skill; null = don't split by what you can cook. */
  cookingSkill: number | null;
}

/** One recommendation: the food, how good it is, and the foods that do exactly the same. */
export interface FoodPick {
  food: FoodRecord;
  score: number;
  /** Cooking skill to learn it; null = not known (a trainer recipe with no Classic record). */
  skillNeeded: number | null;
  /** Other foods with the same effect — any of them will do. */
  sameAs: FoodRecord[];
}

export interface FoodPickerResult {
  top: FoodPick | null;
  runnersUp: FoodPick[];
  /** Better than the top pick but above your Cooking skill. */
  trainFor: FoodPick | null;
  /** The first level where something better than the top pick unlocks. */
  nextUpgrade: { level: number; pick: FoodPick } | null;
  weights: FoodWeights;
}

export type TrainerSkills = Readonly<Record<string, number>>;

const STAT_ACTIVITIES: readonly FoodActivity[] = ["leveling", "dungeon", "raid", "pvp"];

export function skillNeeded(food: FoodRecord, trainerSkills: TrainerSkills): number | null {
  return food.learn.skill ?? trainerSkills[String(food.id)] ?? null;
}

/** Can this player eat it here? Feasts are set out for a group, so only in dungeons and raids. */
function eligible(food: FoodRecord, activity: FoodActivity): boolean {
  if (activity === "fishing") return fishingSkill(food.buff) > 0;
  if (activity === "healing") return food.kind === "food" && food.heal !== null;
  if (food.kind === "feast") return activity === "dungeon" || activity === "raid";
  return food.kind === "food" || food.kind === "drink";
}

function score(food: FoodRecord, activity: FoodActivity, fw: FoodWeights): number {
  if (activity === "fishing") return fishingSkill(food.buff);
  if (activity === "healing") return food.heal?.amount ?? 0;
  return buffValue(food.buff, fw);
}

/** Foods with this key do the same thing, so they collapse into one row. */
function effectKey(food: FoodRecord, activity: FoodActivity): string {
  if (activity === "healing") return `heal:${food.heal?.amount}`;
  return `${food.kind}:${JSON.stringify(food.buff)}`;
}

function byBest(a: FoodPick, b: FoodPick): number {
  return (
    b.score - a.score ||
    (b.food.heal?.amount ?? 0) - (a.food.heal?.amount ?? 0) ||
    (a.skillNeeded ?? 0) - (b.skillNeeded ?? 0) ||
    a.food.name.localeCompare(b.food.name)
  );
}

/** Scored candidates, best first, same-effect foods folded into the best of them. */
function rankCandidates(foods: readonly FoodRecord[], activity: FoodActivity, fw: FoodWeights, trainerSkills: TrainerSkills): FoodPick[] {
  const picks = foods
    .filter((f) => eligible(f, activity))
    .map((food) => ({ food, score: score(food, activity, fw), skillNeeded: skillNeeded(food, trainerSkills), sameAs: [] }))
    .filter((p) => p.score > 0)
    .sort(byBest);
  const groups = new Map<string, FoodPick>();
  for (const pick of picks) {
    const key = effectKey(pick.food, activity);
    const lead = groups.get(key);
    if (lead) lead.sameAs.push(pick.food);
    else groups.set(key, { ...pick, sameAs: [] });
  }
  return [...groups.values()];
}

function canCook(pick: FoodPick, cookingSkill: number | null): boolean {
  return cookingSkill === null || pick.skillNeeded === null || pick.skillNeeded <= cookingSkill;
}

/**
 * The best food for a situation. Level caps what you can eat; Cooking skill
 * (if given) caps what you can cook — anything better beyond it becomes
 * "worth training for".
 */
export function rankFoods(foods: readonly FoodRecord[], input: FoodPickerInput, trainerSkills: TrainerSkills): FoodPickerResult {
  const fw = foodWeights(input.classId, input.specId, input.activity);
  const edible = foods.filter((f) => f.level <= input.level);
  const ranked = rankCandidates(edible, input.activity, fw, trainerSkills);
  const cookable = ranked.filter((p) => canCook(p, input.cookingSkill));
  const top = cookable[0] ?? null;
  const trainFor = ranked.find((p) => !canCook(p, input.cookingSkill) && (!top || p.score > top.score)) ?? null;

  const later = rankCandidates(
    foods.filter((f) => f.level > input.level),
    input.activity,
    fw,
    trainerSkills,
  )
    .filter((p) => p.score > (top?.score ?? 0))
    .sort((a, b) => a.food.level - b.food.level || byBest(a, b));
  const next = later[0];

  return {
    top,
    runnersUp: cookable.slice(1),
    trainFor,
    nextUpgrade: next ? { level: next.food.level, pick: next } : null,
    weights: fw,
  };
}

export function isStatActivity(activity: FoodActivity): boolean {
  return STAT_ACTIVITIES.includes(activity);
}
