export interface TaxPropertySummary {
  property_id: string;
  name: string | null;
  revenue: number;
  expenses: number;
  net_income: number;
}

export interface W2Income {
  employer: string | null;
  ein: string | null;
  wages: number;
  federal_withheld: number;
  social_security_wages: number;
  social_security_withheld: number;
  medicare_wages: number;
  medicare_withheld: number;
  state_wages: number;
  state_withheld: number;
}

export interface TaxSummaryResponse {
  year: number;
  gross_revenue: number;
  total_deductions: number;
  net_taxable_income: number;
  by_category: Record<string, number>;
  by_property: TaxPropertySummary[];
  w2_income: W2Income[];
  w2_total: number;
  total_income: number;
}
