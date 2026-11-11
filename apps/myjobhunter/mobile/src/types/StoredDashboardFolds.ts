import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";

/** The board's folds as the phone keeps them: a Set can't be written as JSON, so the lanes are a list. */
export interface StoredDashboardFolds {
  collapsedLanes: KanbanLane[];
  isClosedOpen: boolean;
}
