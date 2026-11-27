/** One property's line while a split is being edited. */
export interface PropertySplitDraftRow {
  property_id: string;
  included: boolean;
  /** As typed, in dollars. */
  amount: string;
}
