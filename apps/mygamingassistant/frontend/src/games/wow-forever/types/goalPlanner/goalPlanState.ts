import type { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";

/** The plan while its data loads, if a file failed, and once it's worked out. */
export type GoalPlanState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void }
  | { status: typeof LOAD_STATUS.ready; plan: GoalPlan; withoutPrices: boolean };
