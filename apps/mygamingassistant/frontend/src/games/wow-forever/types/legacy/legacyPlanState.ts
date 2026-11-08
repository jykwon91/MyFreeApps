import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";

/** The planner's plan, kept in the URL, and the changes it allows. */
export interface LegacyPlanState {
  plan: LegacyPlan;
  /** The address named a plan no character could have. */
  brokenLink: boolean;
  add: (tree: number, node: number) => void;
  remove: (tree: number, node: number) => void;
  reset: () => void;
}
