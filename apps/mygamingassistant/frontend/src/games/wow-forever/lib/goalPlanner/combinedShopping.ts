/**
 * One shopping list for every profession on the plan: each material once,
 * its counts added up, priced from the first profession that has a price for
 * it, and marked when another profession you're leveling makes it (bolts for
 * Tailoring). What one route crafts isn't taken off another's list — the
 * guides don't say how many of each craft you'd keep.
 */
import { PLANNER_PROFESSION_LABELS, PLANNER_PROFESSIONS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlanShoppingLine } from "@/games/wow-forever/types/goalPlanner/planShoppingLine";
import type { ProfessionPlan } from "@/games/wow-forever/types/goalPlanner/professionPlan";

function professionByLabel(label: string | undefined): PlannerProfession | null {
  if (!label) return null;
  return PLANNER_PROFESSIONS.find((p) => PLANNER_PROFESSION_LABELS[p] === label) ?? null;
}

interface Tally {
  id: number;
  name: string;
  count: number | null;
  unit: number | undefined;
  professions: PlannerProfession[];
  madeBy: PlannerProfession | null;
}

export function combinedShopping(plans: readonly ProfessionPlan[]): PlanShoppingLine[] {
  const leveling = new Set(plans.map((p) => p.profession));
  const tallies = new Map<number, Tally>();
  for (const plan of plans) {
    for (const line of plan.shopping) {
      const tally = tallies.get(line.id) ?? { id: line.id, name: line.name, count: null, unit: undefined, professions: [], madeBy: null };
      if (plan.counted) tally.count = (tally.count ?? 0) + line.count;
      tally.unit ??= plan.unitPrice?.(line.id, line.name).price;
      if (!tally.professions.includes(plan.profession)) tally.professions.push(plan.profession);
      tally.madeBy ??= professionByLabel(line.madeBy);
      tallies.set(line.id, tally);
    }
  }
  return [...tallies.values()].map((t) => ({
    id: t.id,
    name: t.name,
    count: t.count,
    unit: t.unit,
    total: t.unit === undefined || t.count === null ? undefined : t.unit * t.count,
    professions: t.professions,
    makeWith: t.madeBy && leveling.has(t.madeBy) ? t.madeBy : null,
  }));
}
