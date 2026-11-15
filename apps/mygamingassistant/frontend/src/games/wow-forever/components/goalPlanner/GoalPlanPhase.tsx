import PhaseCraftRow from "@/games/wow-forever/components/goalPlanner/PhaseCraftRow";
import PlanStopCard from "@/games/wow-forever/components/goalPlanner/PlanStopCard";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import type { PlanPhase } from "@/games/wow-forever/types/goalPlanner/planPhase";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GoalPlanPhaseProps {
  phase: PlanPhase;
  /** How many stops came before this trip, so the numbers run through the whole route. */
  firstNumber: number;
  faction: PlayerFaction;
}

/** One trip: its stops in travel order, then the crafting until the next trip. */
export default function GoalPlanPhase({ phase, firstNumber, faction }: GoalPlanPhaseProps) {
  const headingId = `goal-phase-${phase.index}`;
  return (
    <section className="space-y-2" aria-labelledby={headingId} data-testid="plan-phase">
      <div>
        <h3 id={headingId} className="font-semibold">
          {phase.title}
        </h3>
        <p className="text-sm text-muted-foreground">{phase.when}</p>
      </div>
      {phase.stops.length > 0 ? (
        <ol className="space-y-2">
          {phase.stops.map((s, i) => (
            <PlanStopCard key={s.stop.id} ordered={s} number={firstNumber + i} faction={faction} />
          ))}
        </ol>
      ) : null}
      {phase.crafting.length > 0 ? (
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-sm font-medium">{GOAL_PLANNER_TEXT.craftingHeading}</p>
          <ul className="divide-y">
            {phase.crafting.map((row) => (
              <PhaseCraftRow key={`${row.profession}-${row.from}-${row.name}`} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
