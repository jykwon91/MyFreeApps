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

/**
 * Badge styling per status. ``expired`` is the loudest because the money is
 * already leaking — the account has almost certainly rolled onto a holdover
 * variable rate.
 */
export const UTILITY_PLAN_RENEWAL_STATUS_CLASSES: Record<
  UtilityPlanRenewalStatus,
  string
> = {
  not_applicable:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  expiring_soon:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
