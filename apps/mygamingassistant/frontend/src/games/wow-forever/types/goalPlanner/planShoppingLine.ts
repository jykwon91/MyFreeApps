import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";

/** One material on the combined shopping list. */
export interface PlanShoppingLine {
  id: number;
  name: string;
  /** Total across every profession; null when a guide names it without a count (Cooking). */
  count: number | null;
  /** Copper each at today's prices; undefined = no price. */
  unit: number | undefined;
  /** `unit` times `count`; undefined when either is unknown. */
  total: number | undefined;
  /** The professions whose routes need it. */
  professions: readonly PlannerProfession[];
  /** The profession that makes it, when it's one you're leveling too (Tailoring for bolts). */
  makeWith: PlannerProfession | null;
}
