import {
  RENTAL_ROI_DEFAULT_TARGET_PCT,
  RENTAL_ROI_MAX_TARGET_PCT,
  RENTAL_ROI_MIN_TARGET_PCT,
} from "../constants/rentalRoi";
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
