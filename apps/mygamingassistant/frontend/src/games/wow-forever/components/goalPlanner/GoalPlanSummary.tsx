import { Coins, Hammer, Route } from "lucide-react";
import PlanStatTile from "@/games/wow-forever/components/goalPlanner/PlanStatTile";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { planSummary } from "@/games/wow-forever/lib/goalPlanner/planSummary";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";

interface GoalPlanSummaryProps {
  plan: GoalPlan;
  withoutPrices: boolean;
}

/** Gold, travel time and crafts for the whole plan. */
export default function GoalPlanSummary({ plan, withoutPrices }: GoalPlanSummaryProps) {
  const summary = planSummary(plan, withoutPrices);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="plan-summary">
      <PlanStatTile icon={Coins} title={GOAL_PLANNER_TEXT.goldTitle} value={summary.gold.value} detail={summary.gold.detail} testId="plan-gold" />
      <PlanStatTile icon={Route} title={GOAL_PLANNER_TEXT.travelTitle} value={summary.travel.value} detail={summary.travel.detail} testId="plan-travel" />
      <PlanStatTile icon={Hammer} title={GOAL_PLANNER_TEXT.craftsTitle} value={summary.crafts.value} detail={summary.crafts.detail} testId="plan-crafts" />
    </div>
  );
}
