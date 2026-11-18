import type { KanbanColumn } from "./kanban-column";

export interface MoveKeys {
  /** The key to send for moving this application to this stage: the earlier attempt's if it never settled. */
  keyFor: (applicationId: string, target: KanbanColumn) => string;
  /** Forget the application's key: its move went through or was refused. */
  settle: (applicationId: string) => void;
}
