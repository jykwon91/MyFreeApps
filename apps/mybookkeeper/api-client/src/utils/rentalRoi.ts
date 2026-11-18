import { formatTag } from "@platform/core/utils/tag";
import { format, parseISO } from "date-fns";
import { RENTAL_ROI_LOAN_LINE_LABELS } from "../constants/rentalRoiBreakdown";
import {
  RENTAL_ROI_DEFAULT_TARGET_PCT,
  RENTAL_ROI_MAX_TARGET_PCT,
  RENTAL_ROI_MIN_TARGET_PCT,
} from "../constants/rentalRoi";
import { RENTAL_ROI_FULL_WINDOW_MONTHS } from "../constants/rentalRoiWindow";
import type { RentalRoiHeadline } from "../types/analytics/rental-roi-headline";
import type { RentalRoiSummary } from "../types/analytics/rental-roi-summary";
import { formatMoneyCents } from "./mortgageFormat";

/**
 * The target return from a URL param or input: clamped to 0–100, and anything
 * that isn't a number (blank, "abc") falls back to the default.
 */
export function parseTargetReturnPct(raw: string | null): number {
  if (raw === null || raw.trim() === "") return RENTAL_ROI_DEFAULT_TARGET_PCT;
  const value = Number(raw);
  if (!Number.isFinite(value)) return RENTAL_ROI_DEFAULT_TARGET_PCT;
  return Math.min(RENTAL_ROI_MAX_TARGET_PCT, Math.max(RENTAL_ROI_MIN_TARGET_PCT, value));
}

/** Cents → "+$300" / "-$420" / "$0" (whole dollars). */
export function formatSignedMoneyCents(cents: number): string {
  const text = formatMoneyCents(cents);
  return cents > 0 && text !== "$0" ? `+${text}` : text;
}

/** Cents → "$1,200.50": a breakdown shows cents so its lines visibly add up. */
export function formatExactMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The name of a line in a break-even breakdown. */
export function rentalRoiCostLineLabel(category: string): string {
  return RENTAL_ROI_LOAN_LINE_LABELS[category] ?? formatTag(category);
}

/** How a line's monthly amount was worked out: "$7,200.00 ÷ 12 months". */
export function describeCostLineAverage(windowTotalCents: number, months: number): string {
  return `${formatExactMoneyCents(windowTotalCents)} ÷ ${months} month${months === 1 ? "" : "s"}`;
}

/** The period a breakdown averages; a rental that started part-way through says so. */
export function rentalRoiPeriodLabel(windowStart: string, windowEnd: string, months: number): string {
  const end = format(parseISO(windowEnd), "MMM yyyy");
  if (months >= RENTAL_ROI_FULL_WINDOW_MONTHS) {
    return `Average of ${format(parseISO(windowStart), "MMM yyyy")} – ${end} (${months} months)`;
  }
  return `Average of the ${months === 1 ? "1 month" : `${months} months`} it was renting, through ${end}`;
}

/** A gap in words: "$420 short", "$300 ahead", or "Even" when it rounds to $0. */
export function describeGap(cents: number): string {
  const amount = formatMoneyCents(Math.abs(cents));
  if (amount === "$0") return "Even";
  return cents < 0 ? `${amount} short` : `${amount} ahead`;
}

/** A decimal percentage string → "11.5%", or "—" when unknown. */
export function formatRatioPct(value: string | null): string {
  if (value === null) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toFixed(1)}%`;
}

/**
 * The portfolio headline. A target total only makes sense when every
 * property has one, so anything less headlines break-even and says how
 * many properties have a target, rather than adding the two bases together.
 */
export function rentalRoiHeadline(summary: RentalRoiSummary): RentalRoiHeadline {
  if (summary.gap_basis === "target") {
    return {
      title: `You need ${formatMoneyCents(summary.total_target_monthly_cents)}/mo to hit your target`,
      coverage: null,
    };
  }
  const coverage = summary.properties_with_target > 0
    ? `target for ${summary.properties_with_target} of ${summary.property_count} properties`
    : "add a purchase price to see a target";
  return {
    title: `Break-even: ${formatMoneyCents(summary.total_break_even_monthly_cents)}/mo`,
    coverage,
  };
}
