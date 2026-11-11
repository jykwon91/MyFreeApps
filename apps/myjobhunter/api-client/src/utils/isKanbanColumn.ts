import { KANBAN_COLUMN_ORDER } from "../constants/kanbanColumnOrder";
import type { KanbanColumn } from "../types/kanban/kanban-column";

/** Whether a string names one of the board's columns. */
export function isKanbanColumn(value: string): value is KanbanColumn {
  return KANBAN_COLUMN_ORDER.some((column) => column === value);
}
