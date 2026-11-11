import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

export interface StageTileProps {
  column: KanbanColumn;
  count: number;
  onPress: () => void;
}
