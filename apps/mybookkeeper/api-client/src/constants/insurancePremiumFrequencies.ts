import type { InsurancePremiumFrequency } from "../types/insurance/insurance-premium-frequency";

/**
 * The four billing periods at runtime — the picker's options, and what a value read out
 * of a declarations page is checked against before it seeds the form.
 */
export const INSURANCE_PREMIUM_FREQUENCIES: readonly InsurancePremiumFrequency[] = [
  "annual",
  "semiannual",
  "quarterly",
  "monthly",
];
