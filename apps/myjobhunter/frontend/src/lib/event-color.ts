import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import { isApplicationEventType } from "@myjobhunter/api-client/utils/isApplicationEventType";
import { EVENT_TYPE_COLORS } from "@/constants/event-type-colors";

/** The badge color for a status. One added on the backend after this build shows gray. */
export function getEventTypeColor(eventType: string): BadgeColor {
  return isApplicationEventType(eventType) ? EVENT_TYPE_COLORS[eventType] : "gray";
}
