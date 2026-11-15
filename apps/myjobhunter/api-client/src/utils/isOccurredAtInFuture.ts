/**
 * Whether a log-event form's "When" (local wall-clock "YYYY-MM-DDTHH:mm") is later than `now`.
 * Blank or unreadable values are not "in the future"; the required-field check owns those.
 */
export function isOccurredAtInFuture(occurredAt: string, now: Date = new Date()): boolean {
  if (!occurredAt) return false;
  const time = new Date(occurredAt).getTime();
  return !Number.isNaN(time) && time > now.getTime();
}
