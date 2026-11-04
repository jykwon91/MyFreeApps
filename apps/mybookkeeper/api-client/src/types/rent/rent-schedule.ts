import type { RentCadence } from "./rent-cadence";

/** A recurring rent obligation. */
export interface RentSchedule {
  id: string;
  applicant_id: string;
  property_id: string | null;
  amount: string;
  cadence: RentCadence;
  start_date: string;
  end_date: string | null;
  grace_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
