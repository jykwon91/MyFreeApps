/** Which approved transactions sit behind a number on the dashboard. */
export interface DrillDownFilter {
  category?: string;
  propertyId?: string;
  propertyIds?: string[];
  type?: "revenue" | "expenses";
  /** The categories left on by the category filter, when it narrows a revenue or expenses figure. */
  categories?: string[];
  startDate?: string;
  endDate?: string;
  label: string;
}
