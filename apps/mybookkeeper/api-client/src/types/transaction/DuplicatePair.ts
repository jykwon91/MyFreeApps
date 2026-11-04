import type { DuplicateTransaction } from "./DuplicateTransaction";

export interface DuplicatePair {
  id: string;
  transaction_a: DuplicateTransaction;
  transaction_b: DuplicateTransaction;
  date_diff_days: number;
  property_match: boolean;
  confidence: string;
}
