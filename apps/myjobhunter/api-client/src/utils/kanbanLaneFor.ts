import type { KanbanLane } from "../types/kanban/kanban-lane";

/** The lane a card sits in, from the verdict of the analysis that spawned it. */
export function kanbanLaneFor(verdict: string | null): KanbanLane {
  return verdict === "strong_fit" ? "strong_fit" : "everything_else";
}
