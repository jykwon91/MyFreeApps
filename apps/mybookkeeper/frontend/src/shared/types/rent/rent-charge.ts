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
  /** The schedule's undivided amount when this period was prorated for a
   *  part-month tenancy; null for a whole period or a one-off charge. */
  full_amount: string | null;
  description: string | null;
  waived_at: string | null;
  waived_reason: string | null;
  allocated: string;
  remaining: string;
  status: RentChargeStatus;
  applications: RentPaymentApplication[];
}
