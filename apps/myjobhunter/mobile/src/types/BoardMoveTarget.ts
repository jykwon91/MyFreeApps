import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";

/** The card the Move sheet is open for, and the stage it's in now. */
export interface BoardMoveTarget {
  item: KanbanItem;
  column: KanbanColumn;
}
