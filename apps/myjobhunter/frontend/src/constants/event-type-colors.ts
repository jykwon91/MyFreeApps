import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { ApplicationEventType } from "@myjobhunter/api-client/types/application-event-type";

/** Badge color per status in the Applications list. */
export const EVENT_TYPE_COLORS: Record<ApplicationEventType, BadgeColor> = {
  applied: "blue",
  email_received: "blue",
  interview_scheduled: "purple",
  interview_completed: "purple",
  offer_received: "green",
  rejected: "red",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "gray",
  follow_up_sent: "blue",
};
