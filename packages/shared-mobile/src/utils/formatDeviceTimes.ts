import { formatCount } from "@platform/core/utils/count";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatLastUsed(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return "Last used just now";
  if (elapsed < HOUR_MS) return `Last used ${formatCount(Math.floor(elapsed / MINUTE_MS), "minute")} ago`;
  if (elapsed < DAY_MS) return `Last used ${formatCount(Math.floor(elapsed / HOUR_MS), "hour")} ago`;
  return `Last used ${formatCount(Math.floor(elapsed / DAY_MS), "day")} ago`;
}

export function formatSignedInDate(iso: string): string {
  const date = new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Signed in ${date}`;
}
