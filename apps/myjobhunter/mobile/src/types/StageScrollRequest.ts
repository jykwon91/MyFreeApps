import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

/** A tap on a stage tile. Each tap is its own object, so tapping the same tile twice scrolls twice. */
export interface StageScrollRequest {
  column: KanbanColumn;
}
