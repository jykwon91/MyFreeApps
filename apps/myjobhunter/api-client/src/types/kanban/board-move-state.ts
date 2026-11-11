import type { KanbanColumn } from "./kanban-column";
import type { KanbanItem } from "./kanban-item";

export interface BoardMoveState {
  /** Ids of the cards with a move in flight. */
  movingIds: ReadonlySet<string>;
  moveTo: (item: KanbanItem, from: KanbanColumn, target: KanbanColumn) => Promise<void>;
}
