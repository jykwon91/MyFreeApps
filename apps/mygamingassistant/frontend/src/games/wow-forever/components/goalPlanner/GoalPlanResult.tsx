import GoalPlanNotes from "@/games/wow-forever/components/goalPlanner/GoalPlanNotes";
import GoalPlanPhase from "@/games/wow-forever/components/goalPlanner/GoalPlanPhase";
import GoalPlanSummary from "@/games/wow-forever/components/goalPlanner/GoalPlanSummary";
import GoalShoppingList from "@/games/wow-forever/components/goalPlanner/GoalShoppingList";
import type { GoalPlan } from "@/games/wow-forever/types/goalPlanner/goalPlan";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GoalPlanResultProps {
  plan: GoalPlan;
  withoutPrices: boolean;
  faction: PlayerFaction;
}

/** The worked-out plan: totals, what to know, every trip in order, and the shopping list. */
export default function GoalPlanResult({ plan, withoutPrices, faction }: GoalPlanResultProps) {
  const firstNumbers = plan.phases.reduce<number[]>((acc, _phase, i) => [...acc, i === 0 ? 1 : acc[i - 1] + plan.phases[i - 1].stops.length], []);
  return (
    <div className="space-y-4" data-testid="goal-plan">
      <GoalPlanSummary plan={plan} withoutPrices={withoutPrices} />
      <GoalPlanNotes notes={plan.notes} />
      {plan.phases.map((phase, i) => (
        <GoalPlanPhase key={phase.index} phase={phase} firstNumber={firstNumbers[i]} faction={faction} />
      ))}
      <GoalShoppingList lines={plan.shopping} />
    </div>
  );
}
