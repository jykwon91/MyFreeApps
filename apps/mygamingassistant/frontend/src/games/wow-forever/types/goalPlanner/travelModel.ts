import type { PlannedLeg } from "@/games/wow-forever/types/goalPlanner/plannedLeg";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";

/**
 * How the stop order measures travel. `P` is a place on the map; the real
 * model (`stopTravel`) runs the World Map's route planner, tests use a grid.
 */
export interface TravelModel<P> {
  /** The option's place on the map; null when the map can't place it. */
  at(option: StopOption): P | null;
  /** A cheap straight-line guess, to pick which places get a real route search. */
  estimate(from: P, to: P): number;
  /** The real trip; null when no known travel connects them. */
  travel(from: P, to: P): PlannedLeg | null;
}
