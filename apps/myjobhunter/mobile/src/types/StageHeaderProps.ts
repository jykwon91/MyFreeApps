import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

export interface StageHeaderProps {
  column: KanbanColumn;
  count: number;
  /** Closed folds away; the active stages always show. */
  isCollapsible: boolean;
  isOpen: boolean;
  onToggle: () => void;
}
