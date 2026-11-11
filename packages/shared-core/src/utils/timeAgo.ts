import { formatDistanceToNowStrict, parseISO } from "date-fns";

/** Like "2 hours ago", or "in 3 days" for a time still to come. */
export function timeAgo(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}
