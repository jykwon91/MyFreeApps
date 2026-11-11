import type { KanbanColumn } from "./kanban-column";
import type { KanbanItem } from "./kanban-item";

/** How a move ended: the server agreed, or refused and the card went back. */
export type BoardMoveOutcome =
  | { kind: "moved"; item: KanbanItem; target: KanbanColumn }
  | { kind: "failed"; item: KanbanItem; target: KanbanColumn; error: unknown };
