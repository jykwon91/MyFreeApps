import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";

/** Everything the player asked the Goal planner for. */
export interface GoalPlannerGoals {
  professions: readonly ProfessionGoal[];
  /** Recipes to learn, by Recipes-page key (`tailoring:3914`, `cooking:12210`). */
  recipes: readonly string[];
}
