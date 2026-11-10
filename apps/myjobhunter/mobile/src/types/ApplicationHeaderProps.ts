import type { Application } from "@myjobhunter/api-client/types/application";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";

export interface ApplicationHeaderProps {
  application: Application;
  column: KanbanColumn;
  /** Null while the company loads. */
  companyName: string | null;
}
