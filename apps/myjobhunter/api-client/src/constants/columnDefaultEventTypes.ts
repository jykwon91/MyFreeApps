import type { KanbanColumn } from "../types/kanban/kanban-column";
import type { StageDefiningEventType } from "../types/kanban/stage-defining-event-type";

/** Default event_type written when the operator drags into a column. */
export const COLUMN_TO_DEFAULT_EVENT_TYPE: Record<KanbanColumn, StageDefiningEventType> = {
  applied: "applied",
  interviewing: "interview_scheduled",
  offer: "offer_received",
  closed: "rejected",
};
