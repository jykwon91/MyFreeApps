import type { TransactionChoice } from "./TransactionChoice";

/** One of the transaction form's option sheets: what it offers, what's picked, and how a pick is kept. */
export interface TransactionSheetConfig {
  options: TransactionChoice[];
  value: string;
  apply: (value: string) => void;
  description?: string;
}
