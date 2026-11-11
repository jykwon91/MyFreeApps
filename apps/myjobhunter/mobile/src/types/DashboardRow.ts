import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";

/** One line of the board as the phone lists it, top to bottom. */
export type DashboardRow =
  | { kind: "stage"; key: string; column: KanbanColumn; count: number; isCollapsible: boolean; isOpen: boolean }
  | { kind: "lane"; key: string; lane: KanbanLane; count: number; isCollapsed: boolean }
  | { kind: "card"; key: string; item: KanbanItem; column: KanbanColumn }
  | { kind: "laneEmpty"; key: string };
