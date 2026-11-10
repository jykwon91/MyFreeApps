import type { TransactionPreview } from "./TransactionPreview";

export interface ImportResult {
  imported: number;
  skipped_duplicates: number;
  format_detected: string;
  /** The first few rows of the file, not all of them. */
  preview: TransactionPreview[];
}
