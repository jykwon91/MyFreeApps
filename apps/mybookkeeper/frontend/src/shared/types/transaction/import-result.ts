import type { TransactionPreview } from "@/shared/types/transaction/transaction-preview";

export interface ImportResult {
  imported: number;
  skipped_duplicates: number;
  format_detected: string;
  preview: TransactionPreview[];
}
