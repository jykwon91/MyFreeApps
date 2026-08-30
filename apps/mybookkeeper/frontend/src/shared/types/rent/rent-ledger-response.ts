import type { RentCharge } from "./rent-charge";
import type { RentPayment } from "./rent-payment";
import type { RentPeriodSummary } from "./rent-period-summary";
import type { RentSchedule } from "./rent-schedule";

/** The full rent picture for one tenant. */
export interface RentLedgerResponse {
  applicant_id: string;
  as_of: string;
  schedules: RentSchedule[];
  charges: RentCharge[];
  payments: RentPayment[];
  /** The period containing `as_of`, or null when no schedule covers it. */
  current_period: RentPeriodSummary | null;
  total_charged: string;
  total_paid: string;
  /** Positive = tenant owes. Negative = tenant is in credit. */
  balance: string;
  unapplied_credit: string;
}
