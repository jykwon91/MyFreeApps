import type { OrderedStop } from "@/games/wow-forever/types/goalPlanner/orderedStop";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";

/** One leg of the plan: the stops to make, in travel order, then the crafting until the next one. */
export interface PlanPhase {
  index: number;
  /** "Start", then "Trip 2", "Trip 3"... */
  title: string;
  /** "Right away", then "When Tailoring reaches 125 and Cooking reaches 50". */
  when: string;
  stops: readonly OrderedStop[];
  crafting: readonly PlanCraftRow[];
}
