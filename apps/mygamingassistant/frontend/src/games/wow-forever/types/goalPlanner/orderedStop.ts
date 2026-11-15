import type { PlannedLeg } from "@/games/wow-forever/types/goalPlanner/plannedLeg";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { Endpoint } from "@/games/wow-forever/worldMap/trip";

/** A stop in travel order, at the place picked for it. */
export interface OrderedStop {
  stop: PlanStop;
  option: StopOption;
  /** Null when no known travel reaches it from the stop before. */
  leg: PlannedLeg | null;
  /** The picked place as a World Map trip end, for "Route there". */
  to: Endpoint;
  /** The stop before it, as the trip's start; null for the first (the map's "Your location"). */
  from: Endpoint | null;
}
