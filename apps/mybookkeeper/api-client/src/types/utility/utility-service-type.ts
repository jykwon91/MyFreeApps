/**
 * Utility service a plan covers.
 *
 * Mirrors ``SERVICE_TYPES`` in ``backend/app/core/utility_plan_constants.py``,
 * which is enforced by a CHECK constraint. A value added there MUST be added
 * here (and to ``constants/utilityServiceTypes.ts``) in the same PR.
 */
export type UtilityServiceType =
  | "electricity"
  | "natural_gas"
  | "water"
  | "internet";
