export interface BankCsvImportRequest {
  /** The multipart body, with the CSV under "file". */
  form: FormData;
  /** The property every imported row is filed under; none leaves them unassigned. */
  propertyId?: string;
  /** The financial account the statement is from; none leaves the rows without one. */
  accountId?: string;
  /** The scope to tag all imported rows with; defaults to 'rental'. */
  transactionScope?: "rental" | "business" | "personal";
  /** A personal spending category to tag all imported rows with. */
  spendingCategoryId?: string;
}
