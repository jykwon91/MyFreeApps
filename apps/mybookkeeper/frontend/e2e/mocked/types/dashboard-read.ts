import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import type { PropertyPnLResponse } from "@mybookkeeper/api-client/types/attribution/property-pnl-response";
import type { InsurancePremiumComparison } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import type { UtilityPlanListResponse } from "@mybookkeeper/api-client/types/utility/utility-plan-list-response";
import type { UtilityPlanRateComparison } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-alert";

/** The answer to one of the dashboard's reads (see fixtures/mockDashboard.ts). */
export type DashboardRead =
  | SummaryResponse
  | number[]
  | PropertyPnLResponse
  | AttributionReviewQueueResponse
  | InsurancePremiumComparison
  | UtilityPlanListResponse
  | UtilityPlanRateComparison
  | UtilityPlanRenewalAlert;
