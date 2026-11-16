import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";
import type { DashboardRow } from "./DashboardRow";

export interface DashboardListRowProps {
  row: DashboardRow;
  now: number;
  movingIds: ReadonlySet<string>;
  /** Handed whether the stage is open now, so one handler serves it and the row can stay memoized. */
  onToggleClosed: (isOpen: boolean) => void;
  onToggleLane: (lane: KanbanLane) => void;
  onOpen: (item: KanbanItem) => void;
  onMove: (item: KanbanItem, column: KanbanColumn) => void;
}
