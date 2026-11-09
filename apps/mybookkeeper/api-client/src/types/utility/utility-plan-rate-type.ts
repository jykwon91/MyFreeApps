/**
 * How a plan's price is set.
 *
 * Mirrors ``RATE_TYPES`` in ``backend/app/core/utility_plan_constants.py``,
 * which is enforced by a CHECK constraint. A value added there MUST be added
 * here (and to ``constants/utilityPlanRateTypes.ts``) in the same PR.
 */
export type UtilityPlanRateType =
  | "fixed"
  | "variable"
  | "indexed"
  | "regulated";
