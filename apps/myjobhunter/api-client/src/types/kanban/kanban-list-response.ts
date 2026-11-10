import type { KanbanItem } from "./kanban-item";

/** Response of ``GET /applications?view=kanban``. */
export interface KanbanListResponse {
  items: KanbanItem[];
  total: number;
}
