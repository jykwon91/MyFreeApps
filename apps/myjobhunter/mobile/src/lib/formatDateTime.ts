/** A moment such as "Oct 20, 2026, 9:30 AM", in the reader's locale. */
export function formatDateTime(isoOrLocal: string): string {
  return new Date(isoOrLocal).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
