/** The next 00:00 UTC after ``now`` -- when the shared daily quota rolls over. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
