const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

export function formatLastUsed(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return "Last used just now";
  if (elapsed < HOUR_MS) return `Last used ${plural(Math.floor(elapsed / MINUTE_MS), "minute")}`;
  if (elapsed < DAY_MS) return `Last used ${plural(Math.floor(elapsed / HOUR_MS), "hour")}`;
  return `Last used ${plural(Math.floor(elapsed / DAY_MS), "day")}`;
}

export function formatSignedInDate(iso: string): string {
  const date = new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Signed in ${date}`;
}
