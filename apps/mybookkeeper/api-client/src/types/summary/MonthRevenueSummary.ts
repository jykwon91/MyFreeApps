/** The revenue categories with money in one month, by category. */
export interface MonthRevenueSummary {
  month: string;
  rental_revenue?: number;
  cleaning_fee_revenue?: number;
  business_income?: number;
}
