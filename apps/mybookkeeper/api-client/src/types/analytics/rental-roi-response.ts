import type { RentalRoiProperty } from "./rental-roi-property";
import type { RentalRoiSummary } from "./rental-roi-summary";

export interface RentalRoiResponse {
  window_start: string;
  window_end: string;
  /** Decimal string echo of the requested target return. */
  target_return_pct: string;
  has_transactions: boolean;
  unassigned_revenue_monthly_cents: number;
  summary: RentalRoiSummary;
  properties: RentalRoiProperty[];
}
