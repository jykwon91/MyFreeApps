import type { RentChargeStatus } from "./rent-charge-status";

/** The "how much has been paid for this period" answer, precomputed. */
export interface RentPeriodSummary {
  charge_id: string;
  label: string;
  period_start: string;
  period_end: string;
  amount: string;
  allocated: string;
  remaining: string;
  status: RentChargeStatus;
}
