import type { UtilityPlanRenewalStatus } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-status";

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
