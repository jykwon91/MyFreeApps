import type { RentChargeType } from "./rent-charge-type";

export interface RentChargeCreateRequest {
  applicant_id: string;
  amount: string;
  due_date: string;
  charge_type: RentChargeType;
  period_start?: string | null;
  period_end?: string | null;
  description?: string | null;
}
