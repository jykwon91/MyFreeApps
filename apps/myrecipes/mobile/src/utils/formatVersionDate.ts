/** When a version was made, as "Nov 11, 2026" in the reader's locale. */
export function formatVersionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
