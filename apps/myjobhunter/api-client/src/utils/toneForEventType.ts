import { EVENT_TYPE_TONES } from "../constants/eventTypeTones";
import type { StatusTone } from "../types/status-tone";
import { isApplicationEventType } from "./isApplicationEventType";

/** The tone for a status. One added on the backend after this build is neutral. */
export function toneForEventType(eventType: string): StatusTone {
  return isApplicationEventType(eventType) ? EVENT_TYPE_TONES[eventType] : "neutral";
}
