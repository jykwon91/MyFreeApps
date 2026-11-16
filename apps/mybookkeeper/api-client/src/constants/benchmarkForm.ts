import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/**
 * The limits the backend enforces on the market-rate and insurance benchmark requests
 * (market_rate_benchmark_upsert_request.py, insurance_benchmark_upsert_request.py).
 * Change one side and the other must follow, or the form lets through input the server refuses.
 */
export const BENCHMARK_SOURCE_MAX_LENGTH = 255;
export const BENCHMARK_NOTES_MAX_LENGTH = 5000;
export const INSURANCE_BENCHMARK_REGION_MAX_LENGTH = 120;

/** A ¢/kWh rate is held to four decimal places and may not exceed 999.9999. */
export const MARKET_RATE_MAX_CENTS_PER_KWH = 999.9999;
export const MARKET_RATE_MAX_DECIMALS = 4;

/** Money is typed in dollars and stored in whole cents, so a third decimal place has no meaning. */
export const BENCHMARK_MONEY_MAX_DECIMALS = 2;
export const INSURANCE_BENCHMARK_MAX_ANNUAL_PREMIUM_DOLLARS = 10_000_000;
export const INSURANCE_BENCHMARK_MAX_COVERAGE_DOLLARS = 1_000_000_000;

export const BENCHMARK_FORM_PROBLEMS = {
  rateRequired: "Enter the going rate as a number above zero.",
  rateTooHigh: (decimalSeparator: DecimalSeparator) =>
    `Enter a rate of ${String(MARKET_RATE_MAX_CENTS_PER_KWH).replace(".", decimalSeparator)}¢ or less.`,
  rateTooPrecise: `Use at most ${MARKET_RATE_MAX_DECIMALS} decimal places.`,
  monthlyRequired: "Enter the monthly price as a number above zero.",
  monthlyTooLarge: "That amount is too large.",
  moneyTooPrecise: "Use dollars and cents, like 1200.50.",
  premiumRequired: "Enter the yearly premium as a number above zero.",
  premiumTooHigh: `A premium over $${INSURANCE_BENCHMARK_MAX_ANNUAL_PREMIUM_DOLLARS.toLocaleString("en-US")} a year looks like a typo.`,
  coverageRequired: "Enter the dwelling coverage as a number above zero.",
  coverageTooHigh: `Coverage over $${INSURANCE_BENCHMARK_MAX_COVERAGE_DOLLARS.toLocaleString("en-US")} looks like a typo.`,
  regionTooLong: `Keep this to ${INSURANCE_BENCHMARK_REGION_MAX_LENGTH} characters or fewer.`,
  sourceTooLong: `Keep this to ${BENCHMARK_SOURCE_MAX_LENGTH} characters or fewer.`,
  notesTooLong: `Keep this to ${BENCHMARK_NOTES_MAX_LENGTH} characters or fewer.`,
  dateRequired: "Pick the date you saw it.",
  dateInFuture: "That date is in the future.",
} as const;
