import type { PlanNoteKind } from "@/games/wow-forever/types/goalPlanner/planNoteKind";

/** Something the player should know about the plan. */
export interface PlanNote {
  kind: PlanNoteKind;
  text: string;
}
