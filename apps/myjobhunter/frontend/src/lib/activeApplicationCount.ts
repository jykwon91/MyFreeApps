import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { KANBAN_ACTIVE_COLUMNS } from "@myjobhunter/api-client/constants/kanbanActiveColumns";

/** How many applications are still in play: every card not in the Closed column. */
export function activeApplicationCount(itemsByColumn: Record<KanbanColumn, KanbanItem[]>): number {
  return KANBAN_ACTIVE_COLUMNS.reduce((total, column) => total + itemsByColumn[column].length, 0);
}
