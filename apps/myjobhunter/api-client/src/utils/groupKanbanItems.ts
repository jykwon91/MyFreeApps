import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { KanbanItem } from "../types/kanban/kanban-item";
import { columnForEventType } from "./columnForEventType";

/** The board's cards by column, each keeping the order the server sent. */
export function groupKanbanItems(items: readonly KanbanItem[]): Record<KanbanColumn, KanbanItem[]> {
  const grouped: Record<KanbanColumn, KanbanItem[]> = { applied: [], interviewing: [], offer: [], closed: [] };
  for (const item of items) grouped[columnForEventType(item.latest_event_type)].push(item);
  return grouped;
}
