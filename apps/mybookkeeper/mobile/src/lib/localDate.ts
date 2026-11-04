/** A date picker works in the phone's time zone, so these never go through UTC, which could move the day. */
export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fullDateLabel(iso: string): string {
  return dateFromIso(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
