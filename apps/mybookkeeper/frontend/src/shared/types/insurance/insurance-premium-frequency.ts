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
