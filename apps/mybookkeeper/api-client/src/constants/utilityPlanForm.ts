import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

export const UTILITY_PLAN_TERM_MONTHS_MIN = 1;
export const UTILITY_PLAN_TERM_MONTHS_MAX = 600;
/** The backend keeps a rate to four decimal places; more would be rejected or rounded. */
export const UTILITY_PLAN_RATE_MAX_DECIMALS = 4;
/** The backend's ceiling on a rate in cents, there to catch dollars entered where cents belong. */
export const UTILITY_PLAN_RATE_MAX_CENTS = 999.9999;
/** The backend's ceiling on an internet speed, there to catch a Kbps-for-Mbps mix-up. */
export const UTILITY_PLAN_MBPS_MAX = 100_000;

export const UTILITY_PLAN_FORM_PROBLEMS = {
  providerRequired: "Provider is required.",
  billCreditIncomplete: "A bill credit needs both an amount and a usage threshold.",
  postPromoNeedsEnd: "A post-promo price needs the date the promo ends.",
  notPositive: "Speeds and data caps must be more than zero.",
  notDollars: (decimalSeparator: DecimalSeparator) => `Enter a dollar amount, like 150${decimalSeparator}00.`,
  negativeDollars: "A dollar amount can't be negative.",
  notRate: `Enter a rate in cents, like 11.5, with at most ${UTILITY_PLAN_RATE_MAX_DECIMALS} decimal places.`,
  rateTooHigh: `A rate is in cents and can't be more than ${UTILITY_PLAN_RATE_MAX_CENTS}. Did you enter dollars?`,
  speedTooHigh: `A speed can't be more than ${UTILITY_PLAN_MBPS_MAX.toLocaleString("en-US")} Mbps.`,
  endBeforeStart: "The term can't end before the service starts.",
  notWholeNumber: "Enter a whole number, like 12.",
  termOutOfRange: `Term must be between ${UTILITY_PLAN_TERM_MONTHS_MIN} and ${UTILITY_PLAN_TERM_MONTHS_MAX} months.`,
} as const;
