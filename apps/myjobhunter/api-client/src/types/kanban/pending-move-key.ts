import type { KanbanColumn } from "./kanban-column";

/** The key sent for a move whose outcome isn't settled yet, and the stage it was for. */
export interface PendingMoveKey {
  target: KanbanColumn;
  key: string;
}
