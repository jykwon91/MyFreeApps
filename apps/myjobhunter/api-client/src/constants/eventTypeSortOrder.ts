import type { ApplicationEventType } from "../types/application-event-type";

/** Where each status sorts: applied, then in process, then offer, then closed out. */
export const EVENT_TYPE_SORT_ORDER: Record<ApplicationEventType, number> = {
  applied: 0,
  email_received: 1,
  interview_scheduled: 2,
  interview_completed: 3,
  offer_received: 4,
  rejected: 5,
  withdrawn: 6,
  ghosted: 7,
  note_added: 8,
  follow_up_sent: 9,
};

/** A status added on the backend after this client was built sorts after the known ones. */
export const UNKNOWN_EVENT_TYPE_SORT_RANK = 998;

/** An application with no events yet sorts last. */
export const NO_EVENT_TYPE_SORT_RANK = 999;
