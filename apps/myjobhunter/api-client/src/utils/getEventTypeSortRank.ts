import {
  EVENT_TYPE_SORT_ORDER,
  NO_EVENT_TYPE_SORT_RANK,
  UNKNOWN_EVENT_TYPE_SORT_RANK,
} from "../constants/eventTypeSortOrder";
import { isApplicationEventType } from "./isApplicationEventType";

/** Lower sorts first. No status sorts last, after statuses this client doesn't know. */
export function getEventTypeSortRank(eventType: string | null | undefined): number {
  if (eventType == null) return NO_EVENT_TYPE_SORT_RANK;
  return isApplicationEventType(eventType) ? EVENT_TYPE_SORT_ORDER[eventType] : UNKNOWN_EVENT_TYPE_SORT_RANK;
}
