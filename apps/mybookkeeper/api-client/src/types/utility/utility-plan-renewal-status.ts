/**
 * Derived renewal state of a plan — never stored, computed by the backend from
 * rate type + term end date + today.
 *
 * Mirrors ``RENEWAL_STATUSES`` in
 * ``backend/app/core/utility_plan_constants.py``. A value added there MUST be
 * added here in the same PR.
 */
export type UtilityPlanRenewalStatus =
  | "not_applicable"
  | "active"
  | "expiring_soon"
  | "expired";

export const UTILITY_PLAN_RENEWAL_STATUS_LABELS: Record<
  UtilityPlanRenewalStatus,
  string
> = {
  not_applicable: "No term",
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
};
