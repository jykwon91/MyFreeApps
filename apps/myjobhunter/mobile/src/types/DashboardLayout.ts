import type { KanbanLane } from "@myjobhunter/api-client/types/kanban/kanban-lane";

/** What the person has opened or folded away on the board. */
export interface DashboardLayout {
  /** Lanes folded away in every stage, as on the website. */
  collapsedLanes: ReadonlySet<KanbanLane>;
  /** Closed starts folded away, as on the website. */
  isClosedOpen: boolean;
}
