import type { RentalRoiCostBreakdown } from "./rental-roi-cost-breakdown";
import type { RentalRoiGapBasis } from "./rental-roi-gap-basis";
import type { RentalRoiMortgageSource } from "./rental-roi-mortgage-source";

export interface RentalRoiProperty {
  property_id: string;
  property_name: string;
  /** A home the owner lives in that also collects rent: all of its costs are counted. */
  is_personal_home: boolean;
  months_averaged: number;
  has_purchase_price: boolean;
  mortgage_source: RentalRoiMortgageSource;
  break_even_monthly_cents: number;
  /** Null without a purchase price (or when the cash invested can't be worked out). */
  target_monthly_cents: number | null;
  actual_revenue_monthly_cents: number;
  gap_monthly_cents: number;
  gap_basis: RentalRoiGapBasis;
  cash_invested_cents: number | null;
  noi_annual_cents: number;
  /** Decimal percentage string, e.g. "11.52". */
  cap_rate_pct: string | null;
  /** Decimal percentage string, e.g. "21.60". */
  cash_on_cash_pct: string | null;
  cost_breakdown: RentalRoiCostBreakdown;
}
