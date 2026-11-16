import { SALARY_PERIOD_LABELS } from "../constants/salaryPeriodLabels";

export { SALARY_PERIOD_LABELS };

function formatAmount(amount: number, currency: string, digits: number): string {
  const fractionDigits = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...fractionDigits,
    }).format(amount);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const number = new Intl.NumberFormat("en-US", fractionDigits).format(amount);
    return currency ? `${number} ${currency}` : number;
  }
}

/**
 * Format a salary range for display, given backend Decimal-as-string
 * min and max values plus an ISO currency code and a canonical period.
 *
 * - Returns the em-dash fallback "—" when both min and max are null
 *   (matches the project-wide "no value" cell convention).
 * - Uses `Intl.NumberFormat` for proper locale + currency rendering
 *   (e.g. "$50,000" not "50000 USD"). Browser-native, zero deps.
 * - Cents are shown only when needed: if any amount in the range has a
 *   fractional part, every amount in the range renders with 2 decimals
 *   ("$17.50 – $22.00 / hour"); whole amounts stay clean ("$120,000").
 * - Never throws on a malformed currency code (e.g. AI-extracted "CA$"):
 *   falls back to the number followed by the raw code ("17.50 CA$").
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
  const hasCents = [min, max].some(
    (n) => n && !Number.isInteger(parseFloat(n)),
  );
  const digits = hasCents ? 2 : 0;
  const fmt = (n: string) => formatAmount(parseFloat(n), currency, digits);
  const label = period ? (SALARY_PERIOD_LABELS[period] ?? "") : "";
  const suffix = label ? ` ${label}` : "";
  if (min && max) return `${fmt(min)} – ${fmt(max)}${suffix}`;
  if (min) return `${fmt(min)}+${suffix}`;
  return `up to ${fmt(max!)}${suffix}`;
}
