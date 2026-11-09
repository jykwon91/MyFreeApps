/** The dates and properties the numbers on the analytics screen were added up over. */
export interface AnalysisScope {
  startDate?: string;
  endDate?: string;
  propertyIds?: string[];
  /** The categories left on by the category filter; undefined when every category counts. */
  categories?: string[];
}
