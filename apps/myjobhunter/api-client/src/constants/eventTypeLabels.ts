import type { ApplicationEventType } from "../types/application-event-type";

/** Display label per application event type — the status an application shows. */
export const EVENT_TYPE_LABELS: Record<ApplicationEventType, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note added",
  follow_up_sent: "Follow-up sent",
};
