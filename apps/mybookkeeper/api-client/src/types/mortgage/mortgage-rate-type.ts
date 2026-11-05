/**
 * Whether a loan's rate is locked for its life or resets on a schedule.
 *
 * Mirrors ``backend/app/core/mortgage_enums.py``. Only a fixed rate can be
 * measured against Freddie Mac's fixed-rate survey, so this is the field that
 * decides whether a loan is comparable at all.
 */
export type MortgageRateType = "fixed" | "arm";

export const MORTGAGE_RATE_TYPES: readonly MortgageRateType[] = [
  "fixed",
  "arm",
] as const;
