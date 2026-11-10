import { EVENT_TYPE_LABELS } from "../constants/eventTypeLabels";
import { isApplicationEventType } from "./isApplicationEventType";

/**
 * A snake_case event type as people read it. One added on the backend after this
 * client was built still reads sensibly ("phone_screen" → "Phone screen").
 */
export function formatEventType(eventType: string): string {
  if (isApplicationEventType(eventType)) return EVENT_TYPE_LABELS[eventType];
  return eventType.charAt(0).toUpperCase() + eventType.slice(1).replace(/_/g, " ");
}
