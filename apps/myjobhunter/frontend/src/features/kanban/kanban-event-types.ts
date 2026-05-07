/**
 * Event types that DEFINE a kanban stage. Drives the lateral-subquery
 * shape on the backend and the optimistic-patch shape on the frontend.
 *
 * Activity event types (``note_added``, ``email_received``,
 * ``follow_up_sent``) are intentionally absent — they record activity
 * but don't transition the application to a different column.
 */
export const STAGE_DEFINING_EVENT_TYPES = [
  "applied",
  "interview_scheduled",
  "interview_completed",
  "offer_received",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;

export type StageDefiningEventType = (typeof STAGE_DEFINING_EVENT_TYPES)[number];

/** Default event_type written when the operator drags into a column. */
export const COLUMN_TO_DEFAULT_EVENT_TYPE: Record<string, StageDefiningEventType> = {
  applied: "applied",
  interviewing: "interview_scheduled",
  offer: "offer_received",
  closed: "rejected",
};
