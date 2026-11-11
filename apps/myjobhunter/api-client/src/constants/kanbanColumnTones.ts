import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { StatusTone } from "../types/status-tone";

/** The tone of the stage badge on an application's page. Every stage shares one, as on the web. */
export const KANBAN_COLUMN_TONES: Record<KanbanColumn, StatusTone> = {
  applied: "info",
  interviewing: "info",
  offer: "info",
  closed: "info",
};
