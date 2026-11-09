import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";

export interface UtilityPlanFilter {
  /** Only current plans that have lapsed or are about to. */
  needsRenewing: boolean;
  serviceType: UtilityServiceType | null;
}
