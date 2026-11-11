import type { ApplicationEventType } from "../types/application-event-type";
import type { StatusTone } from "../types/status-tone";

/** The tone of each application status, as the web Applications list has always coloured it. */
export const EVENT_TYPE_TONES: Record<ApplicationEventType, StatusTone> = {
  applied: "info",
  email_received: "info",
  interview_scheduled: "accent",
  interview_completed: "accent",
  offer_received: "success",
  rejected: "danger",
  withdrawn: "neutral",
  ghosted: "neutral",
  note_added: "neutral",
  follow_up_sent: "info",
};
