import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";

/** One stretch of crafting on the plan: what to make from one skill to another. */
export interface PlanCraftRow {
  profession: PlannerProfession;
  name: string;
  /** The recipe spell (crafting); null for a Cooking row or a "pick one of these" row. */
  spell: number | null;
  /** The made item, for its icon; null for an enchant, a choice row or a Cooking row. */
  itemId: number | null;
  from: number;
  to: number;
  /** A trainer recipe: the skill a trainer teaches it at (visit one before this row); null otherwise. */
  trainerSkill: number | null;
  /** Expected crafts; null when the guide doesn't say (Cooking, a choice row). */
  crafts: number | null;
  /** Expected copper; undefined when a material has no price. */
  cost: number | undefined;
}
