export const UTILITY_PLAN_TERM_MONTHS_MIN = 1;
export const UTILITY_PLAN_TERM_MONTHS_MAX = 600;
/** The backend keeps a rate to four decimal places; more would be rejected or rounded. */
export const UTILITY_PLAN_RATE_MAX_DECIMALS = 4;

export const UTILITY_PLAN_FORM_PROBLEMS = {
  providerRequired: "Provider is required.",
  billCreditIncomplete: "A bill credit needs both an amount and a usage threshold.",
  postPromoNeedsEnd: "A post-promo price needs the date the promo ends.",
  notPositive: "Speeds and data caps must be more than zero.",
  notDollars: "Enter a dollar amount, like 150.00.",
  notRate: `Enter a rate in cents, like 11.5, with at most ${UTILITY_PLAN_RATE_MAX_DECIMALS} decimal places.`,
  notWholeNumber: "Enter a whole number, like 12.",
  termOutOfRange: `Term must be between ${UTILITY_PLAN_TERM_MONTHS_MIN} and ${UTILITY_PLAN_TERM_MONTHS_MAX} months.`,
} as const;
