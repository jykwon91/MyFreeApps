import type { KanbanColumn } from "../types/kanban/kanban-column";

/** The columns shown on the board itself; Closed sits folded away beneath them. */
export const KANBAN_ACTIVE_COLUMNS: readonly KanbanColumn[] = ["applied", "interviewing", "offer"] as const;
