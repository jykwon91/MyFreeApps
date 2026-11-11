import type { KanbanColumn } from "./kanban-column";

/** One card moved to a column on the board. */
export interface MoveKanbanItemArgs {
  applicationId: string;
  target: KanbanColumn;
  /** Fresh per move, so a retried request can't move it twice. */
  idempotencyKey: string;
  /** When the move happened, for the card's stage age until the server answers. */
  occurredAt: string;
}
