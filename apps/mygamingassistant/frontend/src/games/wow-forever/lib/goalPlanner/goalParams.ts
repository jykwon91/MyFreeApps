/**
 * The goals as text, for the link (`?g=tailoring.40.300~cooking.0.300&r=tailoring:3914`)
 * and for the saved copy. Anything that doesn't parse is dropped, so an old or
 * hand-edited link still opens the planner.
 */
import { MAX_CRAFT_SKILL } from "@/games/wow-forever/crafting/craftRoute";
import {
  GOAL_FIELD_SEPARATOR,
  GOAL_SEPARATOR,
  GOAL_TARGETS,
  PLANNER_PROFESSIONS,
  RECIPE_SEPARATOR,
} from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import type { GoalPlannerGoals } from "@/games/wow-forever/types/goalPlanner/goalPlannerGoals";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";

const RECIPE_KEY = /^([a-z]+):(\d+)$/;

export const NO_GOALS: GoalPlannerGoals = { professions: [], recipes: [] };

function isPlannerProfession(value: string): value is PlannerProfession {
  return (PLANNER_PROFESSIONS as readonly string[]).includes(value);
}

function skillIn(value: unknown, min: number): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= MAX_CRAFT_SKILL ? n : null;
}

function isGoalTarget(value: number): boolean {
  return (GOAL_TARGETS as readonly number[]).includes(value);
}

function goalFrom(profession: string, current: unknown, target: unknown): ProfessionGoal | null {
  const from = skillIn(current, 0);
  const to = skillIn(target, 1);
  if (!isPlannerProfession(profession) || from === null || to === null || !isGoalTarget(to)) return null;
  return { profession, current: from, target: to };
}

/** One goal per profession: the first one wins. */
function uniqueGoals(goals: readonly (ProfessionGoal | null)[]): ProfessionGoal[] {
  const seen = new Set<PlannerProfession>();
  return goals.flatMap((g) => {
    if (!g || seen.has(g.profession)) return [];
    seen.add(g.profession);
    return [g];
  });
}

function isRecipeKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RECIPE_KEY.exec(value);
  return match !== null && isPlannerProfession(match[1]);
}

export function parseGoalsParam(text: string | null): ProfessionGoal[] {
  if (!text) return [];
  return uniqueGoals(
    text.split(GOAL_SEPARATOR).map((part) => {
      const [profession, current, target] = part.split(GOAL_FIELD_SEPARATOR);
      return goalFrom(profession ?? "", current, target);
    }),
  );
}

export function parseRecipesParam(text: string | null): string[] {
  if (!text) return [];
  return [...new Set(text.split(RECIPE_SEPARATOR).filter(isRecipeKey))];
}

export function formatGoalsParam(goals: readonly ProfessionGoal[]): string {
  return goals.map((g) => [g.profession, g.current, g.target].join(GOAL_FIELD_SEPARATOR)).join(GOAL_SEPARATOR);
}

export function formatRecipesParam(recipes: readonly string[]): string {
  return recipes.join(RECIPE_SEPARATOR);
}

/** The saved copy: `{ professions: [{ profession, current, target }], recipes: ["tailoring:3914"] }`. */
export function parseStoredGoals(raw: unknown): GoalPlannerGoals | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { professions, recipes } = raw as { professions?: unknown; recipes?: unknown };
  if (!Array.isArray(professions) || !Array.isArray(recipes)) return null;
  const goals = professions.map((g: unknown) => {
    if (typeof g !== "object" || g === null) return null;
    const { profession, current, target } = g as { profession?: unknown; current?: unknown; target?: unknown };
    return typeof profession === "string" ? goalFrom(profession, current, target) : null;
  });
  return { professions: uniqueGoals(goals), recipes: [...new Set(recipes.filter(isRecipeKey))] };
}
