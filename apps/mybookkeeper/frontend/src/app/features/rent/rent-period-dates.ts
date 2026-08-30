import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import type { RentPeriodSummary } from "@/shared/types/rent/rent-period-summary";

/**
 * The period's explicit dates, or null when the label already states them.
 *
 * A whole calendar month is labelled "August 2026", and appending "Aug 1 – Aug
 * 31" tells the host something. A part-month is labelled with its range
 * already, so appending it again reads as "Aug 15 – Aug 31, 2026 · Aug 15 –
 * Aug 31" — the same dates twice. The label leads with the start date exactly
 * when it is a range, which is what distinguishes the two.
 */
export function periodDateRange(period: RentPeriodSummary): string | null {
  const start = formatShortDate(period.period_start);
  if (period.label.startsWith(start)) return null;
  return `${start} – ${formatShortDate(period.period_end)}`;
}
