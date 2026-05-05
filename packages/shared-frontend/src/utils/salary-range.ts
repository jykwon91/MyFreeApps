/**
 * Display label for each canonical salary period. Lookup is forgiving —
 * unknown periods (or null) fall through to an empty string instead of
 * throwing.
 */
export const SALARY_PERIOD_LABELS: Record<string, string> = {
  annual: "/ year",
  hourly: "/ hour",
  monthly: "/ month",
};

/**
 * Format a salary range for display, given backend Decimal-as-string
 * min and max values plus an ISO currency code and a canonical period.
 *
 * - Returns the em-dash fallback "—" when both min and max are null
 *   (matches the project-wide "no value" cell convention).
 * - Uses `Intl.NumberFormat` for proper locale + currency rendering
 *   (e.g. "$50,000" not "50000 USD"). Browser-native, zero deps.
 * - Drops cents — salary ranges show whole-dollar amounts only.
 * - Range syntax:
 *     both → "$50,000 – $80,000 / year"
 *     min only → "$50,000+ / year"
 *     max only → "up to $80,000 / year"
 *
 * @example
 * formatSalaryRange("50000", "80000", "USD", "annual")
 *   // "$50,000 – $80,000 / year"
 * formatSalaryRange(null, null, "USD", "annual")
 *   // "—"
 * formatSalaryRange("50000", null, "USD", "hourly")
 *   // "$50,000+ / hour"
 */
export function formatSalaryRange(
  min: string | null | undefined,
  max: string | null | undefined,
  currency: string,
  period: string | null | undefined,
): string {
  if (!min && !max) return "—";
  const fmt = (n: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(parseFloat(n));
  const label = period ? (SALARY_PERIOD_LABELS[period] ?? "") : "";
  const suffix = label ? ` ${label}` : "";
  if (min && max) return `${fmt(min)} – ${fmt(max)}${suffix}`;
  if (min) return `${fmt(min)}+${suffix}`;
  return `up to ${fmt(max!)}${suffix}`;
}
