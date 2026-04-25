import { format, parseISO, formatDistanceToNowStrict } from "date-fns";

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return format(parseISO(date), "MMM d, yyyy");
}

export function timeAgo(date: string): string {
  return formatDistanceToNowStrict(parseISO(date), { addSuffix: true });
}
