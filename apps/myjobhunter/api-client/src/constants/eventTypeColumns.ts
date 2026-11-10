import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { StageDefiningEventType } from "../types/kanban/stage-defining-event-type";

/**
 * The kanban column each stage-defining event type puts an application in.
 * Mirrors the backend's column mapping so a freshly-loaded board and one
 * mutated locally land on the same column.
 */
export const EVENT_TYPE_TO_COLUMN: Record<StageDefiningEventType, KanbanColumn> = {
  applied: "applied",
  interview_scheduled: "interviewing",
  interview_completed: "interviewing",
  offer_received: "offer",
  rejected: "closed",
  withdrawn: "closed",
  ghosted: "closed",
};
