import type { RentCadence } from "@/shared/types/rent/rent-cadence";
import type { RentChargeType } from "@/shared/types/rent/rent-charge-type";

export const RENT_CADENCE_LABEL: Record<RentCadence, string> = {
  monthly: "monthly",
  weekly: "weekly",
  biweekly: "every 2 weeks",
};

export const RENT_CHARGE_TYPE_LABEL: Record<RentChargeType, string> = {
  rent: "Rent",
  late_fee: "Late fee",
  utility_reimbursement: "Utilities",
  deposit: "Deposit",
  other: "Other",
};

/** Charge types a host can raise by hand. `rent` is absent on purpose — a rent
 *  charge comes from a schedule, so entering one here would double-bill the
 *  period the schedule already generated. */
export const RENT_MANUAL_CHARGE_TYPES: readonly RentChargeType[] = [
  "late_fee",
  "utility_reimbursement",
  "deposit",
  "other",
];
