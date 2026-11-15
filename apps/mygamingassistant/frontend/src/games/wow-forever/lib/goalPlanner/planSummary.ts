import { formatCost, formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { formatTravelTime } from "@/games/wow-forever/lib/goalPlanner/formatTravelTime";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";

export interface PlanStat {
  value: string;
  detail: string;
}

export interface PlanSummary {
  gold: PlanStat;
  travel: PlanStat;
  crafts: PlanStat;
}

const NO_VALUE = "—";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The plan's three headline numbers, as text. Without auction prices there's no gold figure. */
export function planSummary(plan: GoalPlan, withoutPrices: boolean): PlanSummary {
  const stops = plan.phases.reduce((n, p) => n + p.stops.length, 0);
  const gold = plan.materialsCost + plan.vendorCost;
  const floor = plan.costUnknown ? "at least " : "";
  return {
    gold: withoutPrices
      ? { value: NO_VALUE, detail: "Auction prices didn't load" }
      : { value: `${floor}${formatCost(gold)}`, detail: `Materials ${formatCost(plan.materialsCost)} · recipes and books ${formatPrice(plan.vendorCost)}` },
    travel: { value: formatTravelTime(plan.travelSeconds), detail: `${plural(stops, "stop", "stops")}, ${plural(plan.phases.length, "trip", "trips")}` },
    crafts: { value: String(plan.crafts), detail: `expected, across ${plural(plan.professions.length, "profession", "professions")}` },
  };
}
