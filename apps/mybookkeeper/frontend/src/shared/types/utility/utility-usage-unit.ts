/**
 * Unit a utility bill meters consumption in.
 *
 * Mirrors `USAGE_UNITS` in `backend/app/core/utility_usage_constants.py`, which
 * is enforced by the `chk_txn_usage_unit` CHECK constraint. A value added there
 * MUST be added here in the same PR.
 *
 * `kgal` (thousands of gallons) is deliberately distinct from `gallon` — most
 * municipal water bills read in thousands, and collapsing the two is a 1000x
 * error, not a rounding one. Always render the unit alongside the number.
 */
export type UsageUnit = "kwh" | "therm" | "ccf" | "mcf" | "gallon" | "kgal";

/** Short label for display next to a quantity. */
export const USAGE_UNIT_LABELS: Record<UsageUnit, string> = {
  kwh: "kWh",
  therm: "therms",
  ccf: "CCF",
  mcf: "MCF",
  gallon: "gal",
  kgal: "kgal",
};
