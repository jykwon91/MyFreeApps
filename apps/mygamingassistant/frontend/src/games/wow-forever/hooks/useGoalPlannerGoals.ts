import { useCallback, useMemo } from "react";
import { useLiveSearchParams } from "@platform/ui";
import {
  DEFAULT_GOAL_TARGET,
  GOALS_PARAM,
  GOAL_PLANNER_STORAGE_KEY,
  RECIPES_PARAM,
} from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { readSavedSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import {
  NO_GOALS,
  formatGoalsParam,
  formatRecipesParam,
  parseGoalsParam,
  parseRecipesParam,
  parseStoredGoals,
} from "@/games/wow-forever/lib/goalPlanner/goalParams";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { GoalPlannerGoals } from "@/games/wow-forever/types/goalPlanner/goalPlannerGoals";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { ProfessionGoal } from "@/games/wow-forever/types/goalPlanner/professionGoal";

export interface GoalPlannerGoalsState {
  goals: GoalPlannerGoals;
  addProfession: (profession: PlannerProfession) => void;
  removeProfession: (profession: PlannerProfession) => void;
  setGoal: (profession: PlannerProfession, change: Partial<Pick<ProfessionGoal, "current" | "target">>) => void;
  addRecipe: (key: string) => void;
  removeRecipe: (key: string) => void;
}

/** Your skill on that profession's guide when you've saved one; 0 (not learned) otherwise. */
function startingSkill(profession: PlannerProfession): number {
  return (isCraftingProfession(profession) ? readSavedSkill(profession) : null) ?? 0;
}

/**
 * The Goal planner's goals. They live in the link (so a plan can be shared and
 * Back works) and are saved too, so a visit without a link picks up where you left off.
 */
export function useGoalPlannerGoals(): GoalPlannerGoalsState {
  const [params, setParams] = useLiveSearchParams();
  const goalsText = params.get(GOALS_PARAM);
  const recipesText = params.get(RECIPES_PARAM);

  const goals = useMemo<GoalPlannerGoals>(() => {
    if (goalsText === null && recipesText === null) return readStored(GOAL_PLANNER_STORAGE_KEY, parseStoredGoals, NO_GOALS);
    return { professions: parseGoalsParam(goalsText), recipes: parseRecipesParam(recipesText) };
  }, [goalsText, recipesText]);

  const save = useCallback(
    (next: GoalPlannerGoals) => {
      writeStored(GOAL_PLANNER_STORAGE_KEY, next);
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          out.set(GOALS_PARAM, formatGoalsParam(next.professions));
          if (next.recipes.length) out.set(RECIPES_PARAM, formatRecipesParam(next.recipes));
          else out.delete(RECIPES_PARAM);
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const addProfession = useCallback(
    (profession: PlannerProfession) => {
      if (goals.professions.some((g) => g.profession === profession)) return;
      const goal: ProfessionGoal = { profession, current: startingSkill(profession), target: DEFAULT_GOAL_TARGET };
      save({ ...goals, professions: [...goals.professions, goal] });
    },
    [goals, save],
  );

  const removeProfession = useCallback(
    (profession: PlannerProfession) => save({ ...goals, professions: goals.professions.filter((g) => g.profession !== profession) }),
    [goals, save],
  );

  const setGoal = useCallback(
    (profession: PlannerProfession, change: Partial<Pick<ProfessionGoal, "current" | "target">>) =>
      save({ ...goals, professions: goals.professions.map((g) => (g.profession === profession ? { ...g, ...change } : g)) }),
    [goals, save],
  );

  const addRecipe = useCallback(
    (key: string) => {
      if (!goals.recipes.includes(key)) save({ ...goals, recipes: [...goals.recipes, key] });
    },
    [goals, save],
  );

  const removeRecipe = useCallback((key: string) => save({ ...goals, recipes: goals.recipes.filter((k) => k !== key) }), [goals, save]);

  return { goals, addProfession, removeProfession, setGoal, addRecipe, removeRecipe };
}
