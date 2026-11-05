import { format } from "date-fns";

/**
 * Display formatting for loan figures.
 *
 * Pure and shared so the list, the outlook cards and the verdict can never
 * round the same number two different ways.
 */

/** Cents → ``"$3,168"``. Whole dollars: a payment's cents are noise here. */
export function formatMoneyCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * A decimal-string rate → ``"7.125%"``.
 *
 * Trailing zeros are kept as the backend sent them. ``Numeric(6, 3)`` writes
 * ``"2.990"``, and a note quotes a rate to the eighth of a point, so trimming
 * to ``"2.99"`` would silently disagree with the statement in the operator's
 * hand.
 */
export function formatRatePct(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${value}%`;
}

/** A rate band → ``"7.07% – 7.52%"``, or a single figure when both match. */
export function formatRateBand(
  low: string | null,
  high: string | null,
): string {
  if (low === null || high === null) return "—";
  if (low === high) return formatRatePct(low);
  return `${formatRatePct(low)} – ${formatRatePct(high)}`;
}

/** A money band → ``"$6,723 – $16,807"``. */
export function formatMoneyBand(
  low: number | null,
  high: number | null,
): string {
  if (low === null || high === null) return "—";
  if (low === high) return formatMoneyCents(low);
  return `${formatMoneyCents(low)} – ${formatMoneyCents(high)}`;
}

/**
 * A month count → ``"28 years, 7 months"``.
 *
 * Spelled out rather than left as 343: nobody holds a mortgage in months, and
 * the number that has to be compared against a fresh 30-year term is years.
 */
export function formatMonths(months: number | null): string {
  if (months === null) return "—";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "0 months";
}

/**
 * How long the closing costs take to earn back, as a phrase.
 *
 * A ``null`` at the conservative end means the payment does not fall in that
 * case at all — the loan never repays the costs — which must never render as a
 * long wait. That distinction is the whole reason this is a phrase and not a
 * number range.
 */
export function formatBreakeven(
  low: number | null,
  high: number | null,
): string {
  if (low === null) return "longer than the loan has left";
  if (high === null) return `${formatMonths(low)} at best, and possibly never`;
  if (low === high) return formatMonths(low);
  return `${formatMonths(low)} to ${formatMonths(high)}`;
}

/** An ISO date → ``"Aug 13, 2026"``. Dates arrive date-only, so no TZ shift. */
export function formatLoanDate(value: string | null): string {
  if (value === null || value === "") return "—";
  return format(new Date(`${value}T00:00:00`), "MMM d, yyyy");
}
