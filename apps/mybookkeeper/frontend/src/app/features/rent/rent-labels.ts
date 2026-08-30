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

/** What choosing a start date means for the first period, per cadence.
 *
 *  Monthly rent is billed on calendar months, so the start date only decides
 *  how much of the first month is owed. The other cadences tile from the start
 *  date itself, where there is no calendar boundary to align to. */
export const RENT_START_HINT: Record<RentCadence, string> = {
  monthly:
    "Rent falls due on the 1st. Starting mid-month bills a prorated first period covering only those days.",
  weekly: "Weeks are counted from this day — a Friday start bills Friday to Thursday.",
  biweekly:
    "Fortnights are counted from this day — a Friday start bills Friday to the Thursday two weeks on.",
};
