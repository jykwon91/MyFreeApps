import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";
import type { DashboardRow } from "./DashboardRow";

export interface DashboardListRowProps {
  row: DashboardRow;
  now: number;
  movingIds: ReadonlySet<string>;
  onToggleClosed: () => void;
  onToggleLane: (lane: KanbanLane) => void;
  onOpen: (item: KanbanItem) => void;
  onMove: (item: KanbanItem, column: KanbanColumn) => void;
}
