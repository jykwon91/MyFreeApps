import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { ApplicationEventType } from "@myjobhunter/api-client/types/application-event-type";

/** The badge colour of an event in an application's timeline. */
export const EVENT_BADGE_COLORS: Record<ApplicationEventType, BadgeColor> = {
  applied: "blue",
  email_received: "gray",
  interview_scheduled: "yellow",
  interview_completed: "yellow",
  rejected: "red",
  offer_received: "green",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "purple",
  follow_up_sent: "blue",
};
