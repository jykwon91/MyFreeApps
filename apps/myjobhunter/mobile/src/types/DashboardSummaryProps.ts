import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

export interface DashboardSummaryProps {
  counts: Record<KanbanColumn, number>;
  total: number;
  /** A refresh failed, so this is what last loaded. */
  isStale: boolean;
  onShowStage: (column: KanbanColumn) => void;
}
