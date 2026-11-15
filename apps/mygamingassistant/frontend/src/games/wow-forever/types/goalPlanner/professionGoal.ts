import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";

/** "Take Tailoring from 40 to 300." `current` 0 = not learned yet. */
export interface ProfessionGoal {
  profession: PlannerProfession;
  current: number;
  target: number;
}
