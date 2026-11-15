import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlanStopKind } from "@/games/wow-forever/types/goalPlanner/planStopKind";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";

/** Something to do somewhere, before the travel order picks one of its places. */
export interface PlanStop {
  id: string;
  kind: PlanStopKind;
  /** "Train Expert Tailoring". */
  title: string;
  /** How it's done: "From a Tailoring trainer", "Buy the Expert Cookbook", "Quest: Clamlette Surprise". */
  detail: string;
  profession: PlannerProfession | null;
  /**
   * Built from a rank: its place on the profession's ladder (Apprentice 0).
   * On the plan: the trip it's on — 0 = right away, then one per round of new ranks.
   */
  phase: number;
  /** Skill the profession must reach first; null = any time. */
  skill: number | null;
  /** A recipe stop: the skill the recipe is learned at (it's bought on the trip for that rank); null otherwise. */
  learnSkill: number | null;
  /** Character level it needs; null when nothing is known to gate it. */
  level: number | null;
  /** Where it can be done; the travel order picks the one that fits the route. */
  options: readonly StopOption[];
  /** Trainer recipes on the route this visit opens (learn them here, or at any trainer as you reach them). */
  teaches: readonly TaughtRecipe[];
  /** A recipe stop's recipe item, or a book's item id, for its icon; null otherwise. */
  itemId: number | null;
  /** What a vendor asks, in copper (Classic list price); null when nothing is bought. */
  cost: number | null;
}
