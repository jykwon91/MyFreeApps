import type { Application } from "@myjobhunter/api-client/types/application";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

export interface ApplicationActionsProps {
  application: Application;
  column: KanbanColumn;
  /** True once the application is deleted and the screen is on its way out: every action stays disabled. */
  isLeaving: boolean;
  /** Called once a delete lands, so the screen can drop its leave guards and go back. */
  onDeleted: () => void;
}
