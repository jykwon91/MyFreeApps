import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import GoalPlanResult from "@/games/wow-forever/components/goalPlanner/GoalPlanResult";
import GoalPlanSkeleton from "@/games/wow-forever/components/goalPlanner/GoalPlanSkeleton";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { GoalPlanState } from "@/games/wow-forever/types/goalPlanner/goalPlanState";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GoalPlanSectionProps {
  hasGoals: boolean;
  state: GoalPlanState;
  faction: PlayerFaction;
}

/** "Your route": a prompt with no goals, a skeleton while the data loads, a retry if it failed, then the plan. */
export default function GoalPlanSection({ hasGoals, state, faction }: GoalPlanSectionProps) {
  return (
    <section className="space-y-3" aria-labelledby="goal-plan-heading">
      <div>
        <h2 id="goal-plan-heading" className="text-lg font-semibold">
          {GOAL_PLANNER_TEXT.planHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{GOAL_PLANNER_TEXT.startPrompt}</p>
      </div>
      {!hasGoals ? <EmptyStateNote message={GOAL_PLANNER_TEXT.empty} /> : null}
      {hasGoals && state.status === LOAD_STATUS.loading ? <GoalPlanSkeleton /> : null}
      {hasGoals && state.status === LOAD_STATUS.error ? (
        <LoadErrorRetry message={GOAL_PLANNER_TEXT.loadError} onRetry={state.retry} retrying={false} />
      ) : null}
      {hasGoals && state.status === LOAD_STATUS.ready ? (
        <GoalPlanResult plan={state.plan} withoutPrices={state.withoutPrices} faction={faction} />
      ) : null}
    </section>
  );
}
