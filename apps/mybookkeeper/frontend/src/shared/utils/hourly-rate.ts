/**
 * Format a backend Decimal-as-string hourly rate for display.
 *
 * Returns the em-dash fallback when the rate is null or unparseable,
 * matching the project-wide convention for "no value" cells in tables
 * and detail views (cf. shared/utils/currency.ts, shared/utils/date.ts).
 *
 * Use the abbreviated `/hr` suffix everywhere — the long-form
 * "$X.XX / hour" was an outlier on VendorDetail.tsx and has been
 * removed in favour of consistency.
 */
export function formatHourlyRate(rate: string | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  const num = Number(rate);
  if (Number.isNaN(num)) return "—";
  return `$${num.toFixed(2)}/hr`;
}
