import { EVENT_TYPE_LABELS } from "../constants/eventTypeLabels";
import type { ApplicationEventType } from "../types/application-event-type";

/** True for an event type this client knows; stored rows may carry one added later on the backend. */
export function isApplicationEventType(value: string): value is ApplicationEventType {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_LABELS, value);
}
