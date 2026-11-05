/**
 * How often a policy's premium is billed.
 *
 * Mirrors ``app/core/insurance_enums.py::PREMIUM_FREQUENCIES`` — a value added
 * there MUST be added here in the same PR.
 */
export type InsurancePremiumFrequency =
  | "annual"
  | "semiannual"
  | "quarterly"
  | "monthly";

/**
 * The same four at runtime — the picker's options, and what a value read out
 * of a declarations page is checked against before it seeds the form.
 */
export const INSURANCE_PREMIUM_FREQUENCIES: readonly InsurancePremiumFrequency[] = [
  "annual",
  "semiannual",
  "quarterly",
  "monthly",
];
