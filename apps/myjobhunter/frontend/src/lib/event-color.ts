import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import { toneForEventType } from "@myjobhunter/api-client/utils/toneForEventType";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";

/** The badge color for a status. One added on the backend after this build shows gray. */
export function getEventTypeColor(eventType: string): BadgeColor {
  return STATUS_TONE_BADGE_COLORS[toneForEventType(eventType)];
}
