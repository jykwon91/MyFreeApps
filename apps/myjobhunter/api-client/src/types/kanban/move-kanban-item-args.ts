import type { KanbanColumn } from "./kanban-column";

/** One card moved to a column on the board. */
export interface MoveKanbanItemArgs {
  applicationId: string;
  target: KanbanColumn;
  /** One per move, reused when the same move is retried, so the server counts it once. */
  idempotencyKey: string;
  /** When the move happened, for the card's stage age until the server answers. */
  occurredAt: string;
}
