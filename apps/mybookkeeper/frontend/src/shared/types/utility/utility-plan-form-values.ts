import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

/**
 * The utility-plan form's field state, in the shape the inputs hold it.
 *
 * Every money and rate field is a string rather than a number: that is what an
 * ``<input>`` yields, and a rate carries four decimal places that must not
 * round-trip through a float on the way to the API. Conversion to the request
 * shape happens once, in ``shared/lib/utility-plan-form``.
 *
 * ``property_id`` is absent because only the add flow chooses one — a plan
 * cannot be moved between properties (see ``UtilityPlanUpdateRequest``).
 */
export interface UtilityPlanFormValues {
  serviceType: UtilityServiceType;
  rateType: UtilityPlanRateType;
  providerName: string;
  planName: string;
  accountNumber: string;

  energyCharge: string;
  tduCharge: string;
  avgPrice: string;
  monthlyBase: string;

  termMonths: string;
  serviceStartDate: string;
  termEndDate: string;
  etf: string;

  hasBillCredit: boolean;
  billCreditAmount: string;
  billCreditThreshold: string;
  minUsageFee: string;
  minUsageThreshold: string;

  postPromoMonthly: string;
  equipmentFeeMonthly: string;
  downloadMbps: string;
  uploadMbps: string;
  dataCapGb: string;
}
