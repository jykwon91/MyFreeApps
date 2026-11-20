/** A property update's depreciation inputs: only the ones that changed. */
export interface DepreciationInputChanges {
  /** Decimal string, e.g. "25000.00". */
  land_value?: string;
  /** ISO date (YYYY-MM-DD). */
  date_placed_in_service?: string;
}
