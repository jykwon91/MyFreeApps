/**
 * Utility service a plan covers.
 *
 * Mirrors ``SERVICE_TYPES`` in ``backend/app/core/utility_plan_constants.py``,
 * which is enforced by a CHECK constraint. A value added there MUST be added
 * here in the same PR.
 */
export type UtilityServiceType =
  | "electricity"
  | "natural_gas"
  | "water"
  | "internet";

export const UTILITY_SERVICE_TYPES: readonly UtilityServiceType[] = [
  "electricity",
  "natural_gas",
  "water",
  "internet",
];

export const UTILITY_SERVICE_TYPE_LABELS: Record<UtilityServiceType, string> = {
  electricity: "Electricity",
  natural_gas: "Natural gas",
  water: "Water",
  internet: "Internet",
};
