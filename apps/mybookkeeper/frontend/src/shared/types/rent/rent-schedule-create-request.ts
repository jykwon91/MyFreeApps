import type { RentCadence } from "./rent-cadence";

export interface RentScheduleCreateRequest {
  applicant_id: string;
  amount: string;
  cadence: RentCadence;
  start_date: string;
  property_id?: string | null;
  end_date?: string | null;
  grace_days?: number | null;
  notes?: string | null;
}
