import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanPhase } from "@/games/wow-forever/types/goalPlanner/planPhase";
import type { PlanShoppingLine } from "@/games/wow-forever/types/goalPlanner/planShoppingLine";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";

/** The one ordered plan for every goal. */
export interface GoalPlan {
  phases: readonly PlanPhase[];
  professions: readonly ProfessionPlan[];
  shopping: readonly PlanShoppingLine[];
  /** Expected copper for the crafting rows that have a cost. */
  materialsCost: number;
  /** What the recipe vendors on the route ask (Classic list prices). */
  vendorCost: number;
  /** Some cost isn't known, so the total is a floor. */
  costUnknown: boolean;
  crafts: number;
  /** Estimated travel time between the stops, in seconds. */
  travelSeconds: number;
  /** Stops that couldn't be placed on the map (listed in the notes). */
  unplaced: readonly PlanStop[];
  notes: readonly PlanNote[];
}
