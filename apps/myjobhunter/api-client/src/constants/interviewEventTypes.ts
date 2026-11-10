import type { ApplicationEventType } from "../types/application-event-type";

/** The event types that carry interview details, and the only ones whose details and note can be edited. */
export const INTERVIEW_EVENT_TYPES: ReadonlySet<ApplicationEventType> = new Set<ApplicationEventType>([
  "interview_scheduled",
  "interview_completed",
]);
