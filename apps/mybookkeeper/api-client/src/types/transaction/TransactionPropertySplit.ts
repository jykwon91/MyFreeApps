/** One property's share of a transaction split across several properties. */
export interface TransactionPropertySplit {
  /** Null once the property is deleted: the share stays counted, as unassigned. */
  property_id: string | null;
  /** Dollars as the server sends a Numeric ("33.34"). */
  amount: string;
}
