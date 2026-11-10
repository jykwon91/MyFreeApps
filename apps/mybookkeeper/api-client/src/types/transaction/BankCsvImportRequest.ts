export interface BankCsvImportRequest {
  /** The multipart body, with the CSV under "file". */
  form: FormData;
  /** The property every imported row is filed under; none leaves them unassigned. */
  propertyId?: string;
}
