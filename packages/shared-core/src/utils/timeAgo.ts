import { formatDistanceToNowStrict, parseISO } from "date-fns";

const JUST_NOW_MS = 60_000;

/** Like "2 hours ago", or "in 3 days" for a time still to come; "just now" within a minute either way. */
export function timeAgo(iso: string): string {
  const date = parseISO(iso);
  if (Math.abs(Date.now() - date.getTime()) < JUST_NOW_MS) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
