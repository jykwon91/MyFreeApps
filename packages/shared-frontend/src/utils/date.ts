import { format, parseISO } from "date-fns";

export { timeAgo } from "./timeAgo";

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return format(parseISO(date), "MMM d, yyyy");
}
