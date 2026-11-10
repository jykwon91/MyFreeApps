import type { KanbanColumn } from "../types/kanban/kanban-column";

/** Display label per kanban column. */
export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};
