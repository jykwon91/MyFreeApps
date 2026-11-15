import type { ItemPrice } from "@/games/wow-forever/crafting/matPrices";
import type { ShoppingLine } from "@/games/wow-forever/types/crafting";
import type { PlanNote } from "@/games/wow-forever/types/goalPlanner/planNote";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";
import type { PlannerProfession } from "@/games/wow-forever/types/goalPlanner/plannerProfession";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";

/** One profession's part of the plan: its crafting, its stops and what it needs bought. */
export interface ProfessionPlan {
  profession: PlannerProfession;
  label: string;
  from: number;
  to: number;
  rows: readonly PlanCraftRow[];
  /** Expected copper for the rows that have a cost. */
  cost: number;
  /** Some row has no cost (a material with no price, a choice row, or a guide without counts). */
  costUnknown: boolean;
  /** Rank visits, the Apprentice visit, and recipes the route needs bought. */
  stops: readonly PlanStop[];
  /** What the route needs bought or farmed; `counted` false = the guide names no counts (Cooking). */
  shopping: readonly ShoppingLine[];
  counted: boolean;
  /** What the plan should say about this profession (recipes it needs that have no known place). */
  notes: readonly PlanNote[];
  /** Copper each, from this profession's price book; null when it has no prices. */
  unitPrice: ((itemId: number, name: string) => ItemPrice) | null;
}
