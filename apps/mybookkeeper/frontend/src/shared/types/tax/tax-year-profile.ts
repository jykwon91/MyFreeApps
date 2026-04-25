export interface TaxYearProfile {
  id: string;
  organization_id: string;
  tax_year: number;
  filing_status: string | null;
  dependents_count: number;
  property_use_days: Record<string, { personal_days: number; rental_days: number }>;
  home_office_sqft: number | null;
  home_total_sqft: number | null;
  business_mileage: number | null;
}
