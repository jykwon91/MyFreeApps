import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";

export interface LaneHeaderProps {
  lane: KanbanLane;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}
