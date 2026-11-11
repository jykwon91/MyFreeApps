import type { KanbanLane } from "../types/kanban/kanban-lane";

/** Top-to-bottom order of the swim lanes inside a column. */
export const KANBAN_LANE_ORDER: readonly KanbanLane[] = ["strong_fit", "everything_else"] as const;
