export interface UtilityTrendsParams {
  startDate?: string;
  endDate?: string;
  propertyIds?: string[];
  granularity?: "monthly" | "quarterly";
}
