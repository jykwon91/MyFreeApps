/** "Nov 9, 2026, 2:30 PM" in the phone's time zone. */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
