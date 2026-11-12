/** A stored UTC day ("2026-11-12") as "Nov 12". */
export function formatShortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
