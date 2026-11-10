import type { ApplicationEventType } from "../types/application-event-type";

/**
 * The event types a person can log by hand, in the order they're offered.
 * `email_received` is left out: that's the Gmail sync worker's lane.
 */
export const LOGGABLE_EVENT_TYPES: readonly ApplicationEventType[] = [
  "applied",
  "interview_scheduled",
  "interview_completed",
  "offer_received",
  "rejected",
  "withdrawn",
  "ghosted",
  "note_added",
  "follow_up_sent",
];
