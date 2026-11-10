/** A day such as "Oct 20, 2026", in the reader's locale. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
