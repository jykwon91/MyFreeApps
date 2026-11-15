import { format, parseISO } from "date-fns";

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return format(parseISO(date), "MMM d, yyyy");
}

/** A date-only string ("YYYY-MM-DD") in the viewer's locale format, read as a local date. */
export function formatLocaleDate(date: string | null | undefined): string {
  if (!date) return "—";
  return parseISO(date).toLocaleDateString();
}
