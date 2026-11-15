import { Footprints } from "lucide-react";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { formatTravelTime } from "@/games/wow-forever/lib/goalPlanner/formatTravelTime";
import type { PlannedLeg } from "@/games/wow-forever/types/goalPlanner/plannedLeg";

/** How you get to a stop from the one before: "about 6 min · walk → fly to Booty Bay". */
export default function PlanLegLine({ leg }: { leg: PlannedLeg | null }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Footprints className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {leg ? `${formatTravelTime(leg.seconds)} · ${leg.summary}` : GOAL_PLANNER_TEXT.noTravel}
    </p>
  );
}
