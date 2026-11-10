import type { KanbanColumn } from "../types/kanban/kanban-column";

/** Left-to-right order of the kanban dashboard columns. */
export const KANBAN_COLUMN_ORDER: readonly KanbanColumn[] = [
  "applied",
  "interviewing",
  "offer",
  "closed",
] as const;
