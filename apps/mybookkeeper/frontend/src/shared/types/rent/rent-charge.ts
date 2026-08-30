import type { RentChargeStatus } from "./rent-charge-status";
import type { RentChargeType } from "./rent-charge-type";
import type { RentPaymentApplication } from "./rent-payment-application";

/** A dated obligation, with its derived settlement state. */
export interface RentCharge {
  id: string;
  schedule_id: string | null;
  charge_type: RentChargeType;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: string;
  description: string | null;
  waived_at: string | null;
  waived_reason: string | null;
  allocated: string;
  remaining: string;
  status: RentChargeStatus;
  applications: RentPaymentApplication[];
}
