import { formatCurrency } from "@/shared/utils/currency";

/**
 * Display helpers for utility-plan figures.
 *
 * Rate fields arrive as JSON *strings* (``"13.9000"``) because the backend
 * column is ``Numeric`` — Pydantic serializes Decimal as a string to avoid the
 * float round-trip that would turn 5.3509 into 5.350900000000001. These
 * helpers are the only place that string is parsed.
 */

/** ``"13.9000"`` → ``"13.9¢/kWh"``. Trailing zeros are noise on a price tag. */
export function formatCentsPerKwh(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  // Up to 4 dp preserves a TDU charge like 5.3509; minimumFractionDigits 0
  // drops the padding on a clean 13.9.
  const formatted = parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
  return `${formatted}¢/kWh`;
}

/** Integer cents → ``"$4.39"``. */
export function formatCents(value: number | null): string {
  if (value === null) return "—";
  return formatCurrency(value / 100);
}

/**
 * Human phrasing for the renewal countdown.
 *
 * ``days`` is negative once the term has lapsed — the case that matters, since
 * the account is by then on an unfixed holdover rate.
 */
export function formatRenewalCountdown(days: number | null): string {
  if (days === null) return "No term end recorded";
  if (days < 0) {
    const lapsed = Math.abs(days);
    return `Lapsed ${lapsed} day${lapsed === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "Ends today";
  return `Ends in ${days} day${days === 1 ? "" : "s"}`;
}

/** ``"2026-01-23"`` → ``"Jan 23, 2026"``, parsed as a local date, not UTC. */
export function formatPlanDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
