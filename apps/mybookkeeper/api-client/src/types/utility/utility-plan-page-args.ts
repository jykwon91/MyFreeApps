import type { UtilityServiceType } from "./utility-service-type";

export interface UtilityPlanPageArgs {
  service_type?: UtilityServiceType;
  /** True narrows the list to current plans whose term has lapsed or ends within the renewal window. */
  needs_renewal?: boolean;
}
