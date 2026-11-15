const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** 6800 → "about 1 h 53 min"; 300 → "about 5 min". Never below a minute. */
export function formatTravelTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) return `about ${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest ? `about ${hours} h ${rest} min` : `about ${hours} h`;
}
