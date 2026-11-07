/** A transaction as extraction leaves one: flagged for review, with its source document. */
export interface ExtractedTransactionInput {
  /** Must end in .png: the source document is a PNG. */
  file_name: string;
  vendor: string;
  amount: string;
  transaction_date: string;
  review_reason: string;
}
