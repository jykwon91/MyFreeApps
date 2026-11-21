import { dateToLocalDateTime } from "./interviewEventForm";

/**
 * The `occurred_at` sent for a hand-logged event, as a UTC ISO string.
 *
 * The form holds a minute ("YYYY-MM-DDTHH:mm") but a stage move is stamped to the
 * millisecond by the server, so an event logged "now" and sent as hh:mm:00 would lose to
 * a move made earlier in that minute, and the stage would not follow it. A time left at
 * the form's "now" default, or set to the current minute, is sent as the moment of
 * submitting instead, so it is the latest event.
 */
export function occurredAtForRequest(picked: string, defaultOccurredAt: string, now: Date = new Date()): string {
  if (picked === defaultOccurredAt || picked === dateToLocalDateTime(now)) return now.toISOString();
  return new Date(picked).toISOString();
}
