import type { RentalRoiGapBasis } from "./rental-roi-gap-basis";

export interface RentalRoiSummary {
  property_count: number;
  properties_with_target: number;
  total_break_even_monthly_cents: number;
  /** Sum over only the properties that have a target. */
  total_target_monthly_cents: number;
  total_actual_revenue_monthly_cents: number;
  total_gap_monthly_cents: number;
  gap_basis: RentalRoiGapBasis;
}
