import { PLAN_STOP_KIND } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";

/** The skills a profession's rank visits on the plan are made at, past where it starts. */
export function rankVisitSkills(plan: Pick<ProfessionPlan, "stops" | "from">): number[] {
  return plan.stops
    .filter((s) => (s.kind === PLAN_STOP_KIND.learn || s.kind === PLAN_STOP_KIND.rank) && s.skill !== null && s.skill > plan.from)
    .map((s) => s.skill ?? 0)
    .sort((a, b) => a - b);
}

/**
 * The trip something at `skill` falls on: how many of the profession's rank
 * visits come before it. So every profession's next rank lands on trip 2,
 * the one after on trip 3, wherever each one starts.
 */
export function relativePhase(visitSkills: readonly number[], skill: number): number {
  return visitSkills.filter((s) => s <= skill).length;
}
