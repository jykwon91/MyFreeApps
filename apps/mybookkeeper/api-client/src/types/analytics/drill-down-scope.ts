/** Which approved transactions sit behind a number: the part of a drill-down that decides the rows. */
export interface DrillDownScope {
  category?: string;
  propertyId?: string;
  propertyIds?: string[];
  type?: "revenue" | "expenses";
  /** The categories left on by the category filter, when it narrows a revenue or expenses figure. */
  categories?: string[];
  startDate?: string;
  endDate?: string;
}
