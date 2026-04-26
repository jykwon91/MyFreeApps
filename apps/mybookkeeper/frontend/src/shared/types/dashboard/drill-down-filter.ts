export interface DrillDownFilter {
  category?: string;
  propertyId?: string;
  propertyIds?: string[];
  type?: "revenue" | "expenses";
  startDate?: string;
  endDate?: string;
  label: string;
}
