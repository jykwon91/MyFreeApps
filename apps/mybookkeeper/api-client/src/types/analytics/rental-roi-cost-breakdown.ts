import type { RentalRoiCostLine } from "./rental-roi-cost-line";

export interface RentalRoiCostBreakdown {
  debt_service_monthly_cents: number;
  operating_monthly_cents: number;
  mortgage_lines: RentalRoiCostLine[];
  operating_lines: RentalRoiCostLine[];
  /** Bills the loan's escrow already pays: shown as left out, never added to break-even. */
  escrow_covered_lines: RentalRoiCostLine[];
}
