import type { UtilityServiceType } from "./utility-service-type";

export interface UtilityPlanListArgs {
  property_id?: string;
  service_type?: UtilityServiceType;
  expiring_before?: string;
  limit?: number;
  offset?: number;
}
