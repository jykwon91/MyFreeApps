import type { ApplicationEventType } from "@myjobhunter/api-client/types/application-event-type";

/** The label on an event in an application's timeline. */
export const EVENT_LABELS: Record<ApplicationEventType, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note",
  follow_up_sent: "Follow-up sent",
};
